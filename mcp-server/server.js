#!/usr/bin/env node
/**
 * MBSE4SDV MCP Server
 * Exposes the MBSE4SDV WebGME REST API (/mbse4sdv/api) as MCP tools. All operations except login require a Bearer token.
 *
 * This is a Model Context Protocol (MCP) server that exposes API endpoints as tools for LLMs.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import express from "express";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8888/mbse4sdv/api";
const MCP_TRANSPORT = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();
const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);

function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parseIntegerEnv(value, defaultValue) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

const ALLOW_FULL_TREE_READS = parseBooleanEnv(process.env.MCP_ALLOW_FULL_TREE_READS, false);
const ALLOW_RECURSIVE_TREE_READS = parseBooleanEnv(
  process.env.MCP_ALLOW_RECURSIVE_TREE_READS,
  ALLOW_FULL_TREE_READS
);
const MIN_RECURSIVE_READ_NODE_DEPTH = Math.max(
  1,
  parseIntegerEnv(process.env.MCP_MIN_RECURSIVE_READ_NODE_DEPTH, 4)
);

const recursiveTreeReadToolNames = new Set([
  "get_elements_under_node",
  "get_children",
]);

function buildAxiosConfig(method, path, args = {}) {
  const { body, bearerToken, authorization, ...rest } = args ?? {};
  const authHeader = authorization ?? (bearerToken ? `Bearer ${bearerToken}` : undefined);

  return {
    method,
    url: `${BASE_URL}${path}`,
    data: body,
    params: rest,
    headers: authHeader ? { Authorization: authHeader } : undefined,
  };
}

// Shared schema fragments

const bearerTokenProp = {
  bearerToken: {
    type: "string",
    description: "Bearer token obtained from login. Example: 'eyJhbGciOiJIUzI1NiJ9...'"
  }
};

const projectBranchProps = {
  project: {
    type: "string",
    description: "Project identifier in 'owner+ProjectName' format. Example: 'guest+MyProject'"
  },
  "branch-commit": {
    type: "string",
    description: "Branch name or commit hash to read from. Defaults to 'master'. Example: 'master'"
  }
};

const metaQueryProps = {
  ...projectBranchProps,
  metaElementType: {
    description: "Filter by meta type name(s). Example: 'FunctionalRequirement' or ['FR', 'SysBlock']",
    oneOf: [
      { type: "string" },
      { type: "array", items: { type: "string" } }
    ]
  },
  showChildren: {
    type: "boolean",
    default: false,
    description: "Include containment children in response. Blocked by default on MCP reads unless recursive tree reads are explicitly enabled."
  },
  showPointers: { type: "boolean", default: false, description: "Include pointer targets in response" },
  showSets: { type: "boolean", default: false, description: "Include set members in response" },
  showLargeData: { type: "boolean", default: false, description: "Include large data fields (e.g. SVG)" }
};

const nodesByNodeProps = {
  ...metaQueryProps,
  idNode: {
    type: "string",
    description: "WebGME node path to start traversal from. Example: '/V/I/p'. Omit for root."
  },
  nodeId: {
    type: "string",
    description: "Alias for idNode. Example: '/V/I/p'."
  },
  node: {
    type: "string",
    description: "Alias for idNode. Example: '/V/I/p'."
  }
};

// Tool definitions

const tools = [
  {
    name: "login",
    description: [
      "Login with username and password to obtain a Bearer token.",
      "ALWAYS call this first - the returned token is required by every other endpoint.",
      "Returns: { tokenType: 'Bearer', token: '<jwt>' }.",
      "Pass the token value as 'bearerToken' in subsequent tool calls."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["body"],
      properties: {
        body: {
          type: "object",
          required: ["username", "password"],
          description: "Login credentials",
          properties: {
            username: { type: "string", description: "WebGME username. Example: 'demo'" },
            password: { type: "string", description: "WebGME password. Example: 'demo'" }
          }
        }
      }
    }
  },

  {
    name: "get_metamodel",
    description: [
      "Get all meta elements (the metamodel / type definitions) for a project and branch.",
      "Useful to discover what types (FunctionalRequirement, SysBlock, etc.) exist before querying instances.",
      "Returns: { elementList: [ { id, name, metaName, parentId, attributes, ... } ] }."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project"],
          description: "Project/branch selector",
          properties: projectBranchProps
        }
      }
    }
  },

  {
    name: "get_meta_elements_by_type",
    description: [
      "Get meta elements (type definitions, not instances) filtered by one or more metaElementType names.",
      "Use get_metamodel first to discover available type names.",
      "Returns: { elementList: [ { id, name, metaName, parentId, attributes, ... } ] }."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project"],
          description: "Query parameters",
          properties: metaQueryProps
        }
      }
    }
  },

  {
    name: "get_elements_by_type",
    description: [
      "Get instance elements (model instances, not type definitions) filtered by metaElementType name(s).",
      "MCP safety policy requires metaElementType; unfiltered full-model reads are blocked unless MCP_ALLOW_FULL_TREE_READS=true.",
      "Returns: { elementList: [ { id, name, metaName, parentId, attributes } ] }.",
      "Use showChildren/showPointers/showSets flags to include related data in one call."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project", "metaElementType"],
          description: "Query parameters",
          properties: metaQueryProps
        }
      }
    }
  },

  {
    name: "get_elements_by_name",
    description: [
      "Get instance elements filtered by element name(s).",
      "MCP safety policy requires elementName or name; unfiltered full-model reads are blocked unless MCP_ALLOW_FULL_TREE_READS=true.",
      "Returns: { elementList: [ { id, name, metaName, parentId, attributes } ] }.",
      "Supports single name string or an array of names."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project"],
          anyOf: [
            { required: ["elementName"] },
            { required: ["name"] }
          ],
          description: "Query parameters",
          properties: {
            ...metaQueryProps,
            elementName: {
              description: "Element name(s) to search for. Example: 'FR_1' or ['FR_1', 'FR_2']",
              oneOf: [
                { type: "string" },
                { type: "array", items: { type: "string" } }
              ]
            },
            name: {
              description: "Alias for elementName. Example: 'FR_1' or ['FR_1', 'FR_2']",
              oneOf: [
                { type: "string" },
                { type: "array", items: { type: "string" } }
              ]
            }
          }
        }
      }
    }
  },

  {
    name: "get_elements_under_node",
    description: [
      "Get all instance elements recursively under a given node (or from root if idNode is omitted).",
      "Hidden and blocked by default because recursive subtree reads can overload the MBSE4SDV API; enable with MCP_ALLOW_RECURSIVE_TREE_READS=true.",
      "Returns: { elementList: [ { id, name, metaName, parentId, attributes } ] }.",
      "Combine with metaElementType to filter by type within that subtree."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project"],
          description: "Query parameters",
          properties: nodesByNodeProps
        }
      }
    }
  },

  {
    name: "get_children",
    description: [
      "Get containment children recursively for a given node.",
      "Hidden and blocked by default because recursive subtree reads can overload the MBSE4SDV API; enable with MCP_ALLOW_RECURSIVE_TREE_READS=true.",
      "Returns the full containment subtree under idNode.",
      "Returns: { elementList: [ { id, name, metaName, parentId, ... } ] }."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project"],
          description: "Query parameters",
          properties: nodesByNodeProps
        }
      }
    }
  },

  {
    name: "get_pointer_elements",
    description: [
      "Get elements pointed to by a given node (pointer relationships).",
      "Returns: { elementList: [ { id, name, pointerName, target } ] }.",
      "Useful to traverse cross-references like 'refines', 'allocatedTo', etc."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project"],
          description: "Query parameters",
          properties: nodesByNodeProps
        }
      }
    }
  },

  {
    name: "get_set_elements",
    description: [
      "Get set member elements for a given node.",
      "Sets are named collections (e.g. 'allocatedTo', 'verifies').",
      "Returns: { elementList: [ { id, name, setName, members } ] }."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project"],
          description: "Query parameters",
          properties: nodesByNodeProps
        }
      }
    }
  },

  {
    name: "create_nodes",
    description: [
      "Create one or more nodes in batch and commit to the branch.",
      "Use tempId to reference newly created nodes within the same batch (e.g. as parentRef).",
      "Returns: { commitHash, status }.",
      "nodeElementList item fields: tempId, parentRef (node path or tempId, 'ROOT' for root), metaType (type name), name, attributes, registry, pointers, sets."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project", "nodeElementList"],
          description: "Create request",
          properties: {
            ...projectBranchProps,
            idParentNode: {
              type: "string",
              description: "Default parent node path for nodes that don't specify parentRef. Example: '/V/I/p'"
            },
            commitMessage: { type: "string", description: "Git-style commit message. Example: 'Add functional requirements'" },
            nodeElementList: {
              type: "array",
              description: "List of nodes to create",
              items: {
                type: "object",
                required: ["tempId", "metaType"],
                properties: {
                  tempId: { type: "string", description: "Local temporary ID for intra-batch references. Example: 'fr_1'" },
                  parentRef: { type: "string", description: "Parent node path or tempId. Use 'ROOT' for model root. Example: '/V/I/p' or 'fr_1'" },
                  metaType: { type: "string", description: "Meta type name. Example: 'FunctionalRequirement'" },
                  name: { type: "string", description: "Node name. Example: 'FR_01'" },
                  attributes: { type: "object", description: "Attribute key-value pairs. Example: { description: 'The system shall...' }" },
                  registry: { type: "object", description: "Registry key-value pairs, often visual metadata like position. Example: { position: { x: 100, y: 200 } }" },
                  pointers: { type: "object", description: "Initial pointer targets keyed by pointer name. Values can be node paths, tempIds, or element objects with id." },
                  sets: { type: "object", description: "Initial set members keyed by set name. Values are arrays of node paths or tempIds." }
                }
              }
            }
          }
        }
      }
    }
  },

  {
    name: "modify_nodes",
    description: [
      "Apply a mixed list of operations in batch and commit. Most flexible write endpoint.",
      "Supported op values: createNode, moveNode, updateAttributes, updateRegistry, createSet, setPointer, clearPointer, addSetMembers, removeSetMembers, replaceSetMembers, deleteSet, deleteNode.",
      "Returns: { commitHash, status }.",
      "Common op fields: op (required), idNode or tempId (target), plus op-specific fields.",
      "Example createNode: { op:'createNode', tempId:'t1', parentRef:'/V', metaType:'Block', name:'B1', attributes:{} }.",
      "Example updateAttributes: { op:'updateAttributes', idNode:'/V/I/p/0', attributes:{ description:'updated' } }.",
      "Example deleteNode: { op:'deleteNode', idNode:'/V/I/p/old' }.",
      "Example setPointer: { op:'setPointer', idNode:'/V/I/p/0', pointerName:'refines', targetRef:'/V/I/p/1' }.",
      "Example addSetMembers: { op:'addSetMembers', idNode:'/V/I/p/0', setName:'allocatedTo', members:['/V/I/p/1'] }."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project", "operations"],
          description: "Modify request",
          properties: {
            ...projectBranchProps,
            idParentNode: { type: "string", description: "Default parent for createNode operations that omit parentRef" },
            commitMessage: { type: "string", description: "Commit message. Example: 'Update FR attributes and add traceability'" },
            operations: {
              type: "array",
              description: "Ordered list of operations to apply atomically",
              items: {
                type: "object",
                required: ["op"],
                properties: {
                  op: {
                    type: "string",
                    enum: ["createNode", "moveNode", "updateAttributes", "updateRegistry",
                           "createSet", "setPointer", "clearPointer",
                           "addSetMembers", "removeSetMembers", "replaceSetMembers",
                           "deleteSet", "deleteNode"],
                    description: "Operation type"
                  },
                  idNode: { type: "string", description: "Target node path. Example: '/V/I/p/0'" },
                  tempId: { type: "string", description: "Temporary ID for new nodes (used with createNode)" },
                  parentRef: { type: "string", description: "Parent path or tempId (used with createNode/moveNode)" },
                  metaType: { type: "string", description: "Meta type name (used with createNode)" },
                  name: { type: "string", description: "Node name (used with createNode)" },
                  attributes: { type: "object", description: "Attribute key-value map (used with updateAttributes/createNode)" },
                  registry: { type: "object", description: "Registry key-value map (used with updateRegistry/createNode), including visual position" },
                  pointerName: { type: "string", description: "Pointer name (used with setPointer/clearPointer)" },
                  targetRef: { type: "string", description: "Target node path for pointer (used with setPointer)" },
                  setName: { type: "string", description: "Set name (used with createSet/deleteSet/addSetMembers/etc.)" },
                  members: { type: "array", items: { type: "string" }, description: "Member node paths (used with addSetMembers/removeSetMembers/replaceSetMembers)" }
                }
              }
            }
          }
        }
      }
    }
  },

  {
    name: "create_pointers",
    description: [
      "Create (assign) pointer relationships on nodes in batch and commit.",
      "A pointer is a named reference from one node to another (e.g. 'refines', 'satisfies').",
      "Returns: { commitHash, status }."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project", "pointerElementList"],
          description: "Create pointers request",
          properties: {
            ...projectBranchProps,
            commitMessage: { type: "string", description: "Commit message. Example: 'Add refines traceability'" },
            pointerElementList: {
              type: "array",
              description: "List of pointer assignments",
              items: {
                type: "object",
                properties: {
                  idNode: { type: "string", description: "Source node path. Example: '/V/I/p/0'" },
                  pointerName: { type: "string", description: "Pointer name. Example: 'refines'" },
                  targetRef: {
                    description: "Target node path or reference object. Example: '/V/I/p/1'",
                    oneOf: [
                      { type: "string" },
                      { type: "object", additionalProperties: true }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    }
  },

  {
    name: "update_pointers",
    description: [
      "Update (overwrite) existing pointer relationships on nodes in batch and commit.",
      "Same body structure as create_pointers.",
      "Returns: { commitHash, status }."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project", "pointerElementList"],
          description: "Modify pointers request",
          properties: {
            ...projectBranchProps,
            commitMessage: { type: "string", description: "Commit message" },
            pointerElementList: {
              type: "array",
              description: "List of pointer updates",
              items: {
                type: "object",
                properties: {
                  idNode: { type: "string", description: "Source node path. Example: '/V/I/p/0'" },
                  pointerName: { type: "string", description: "Pointer name. Example: 'refines'" },
                  targetRef: {
                    description: "New target node path. Example: '/V/I/p/2'",
                    oneOf: [
                      { type: "string" },
                      { type: "object", additionalProperties: true }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    }
  },

  {
    name: "delete_pointers",
    description: [
      "Clear (remove) pointer relationships from nodes in batch and commit.",
      "Returns: { commitHash, status }."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project", "pointerElementList"],
          description: "Delete pointers request",
          properties: {
            ...projectBranchProps,
            commitMessage: { type: "string", description: "Commit message" },
            pointerElementList: {
              type: "array",
              description: "List of pointers to clear",
              items: {
                type: "object",
                properties: {
                  idNode: { type: "string", description: "Source node path. Example: '/V/I/p/0'" },
                  pointerName: { type: "string", description: "Pointer name to clear. Example: 'refines'" }
                }
              }
            }
          }
        }
      }
    }
  },

  {
    name: "create_sets",
    description: [
      "Create named sets on nodes and optionally add initial members, then commit.",
      "A set is a named collection of node references (e.g. 'allocatedTo', 'verifies').",
      "Returns: { commitHash, status }."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project", "setElementList"],
          description: "Create sets request",
          properties: {
            ...projectBranchProps,
            commitMessage: { type: "string", description: "Commit message" },
            setElementList: {
              type: "array",
              description: "List of set creation operations",
              items: {
                type: "object",
                properties: {
                  idNode: { type: "string", description: "Node to add the set to. Example: '/V/I/p/0'" },
                  setName: { type: "string", description: "Set name. Example: 'allocatedTo'" },
                  members: { type: "array", items: { type: "string" }, description: "Initial member node paths. Example: ['/V/I/p/1', '/V/I/p/2']" }
                }
              }
            }
          }
        }
      }
    }
  },

  {
    name: "update_sets",
    description: [
      "Replace set members on nodes in batch and commit (full replace, not incremental).",
      "Returns: { commitHash, status }."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project", "setElementList"],
          description: "Modify sets request",
          properties: {
            ...projectBranchProps,
            commitMessage: { type: "string", description: "Commit message" },
            setElementList: {
              type: "array",
              description: "List of set modifications (full member replacement)",
              items: {
                type: "object",
                properties: {
                  idNode: { type: "string", description: "Node that owns the set. Example: '/V/I/p/0'" },
                  setName: { type: "string", description: "Set name. Example: 'allocatedTo'" },
                  members: { type: "array", items: { type: "string" }, description: "New complete member list. Example: ['/V/I/p/3']" }
                }
              }
            }
          }
        }
      }
    }
  },

  {
    name: "delete_sets",
    description: [
      "Delete named sets from nodes in batch and commit.",
      "Returns: { commitHash, status }."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project", "setElementList"],
          description: "Delete sets request",
          properties: {
            ...projectBranchProps,
            commitMessage: { type: "string", description: "Commit message" },
            setElementList: {
              type: "array",
              description: "List of sets to delete",
              items: {
                type: "object",
                properties: {
                  idNode: { type: "string", description: "Node that owns the set. Example: '/V/I/p/0'" },
                  setName: { type: "string", description: "Set name to delete. Example: 'allocatedTo'" }
                }
              }
            }
          }
        }
      }
    }
  },

  {
    name: "delete_nodes",
    description: [
      "Delete nodes in batch by their node paths and commit.",
      "All children of deleted nodes are also removed.",
      "Returns: { commitHash, status }."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project", "idNodeList"],
          description: "Delete nodes request",
          properties: {
            ...projectBranchProps,
            idNodeList: {
              type: "array",
              items: { type: "string" },
              description: "List of node paths to delete. Example: ['/V/I/p/6', '/V/I/p/Y']"
            },
            commitMessage: { type: "string", description: "Commit message. Example: 'Remove obsolete requirements'" }
          }
        }
      }
    }
  },

  {
    name: "get_node_position",
    description: [
      "Read the visual canvas position { x, y } of a single node.",
      "Returns null if the node has no position set.",
      "Call before set_node_position to inspect the current layout."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project", "idNode"],
          description: "Position query",
          properties: {
            ...projectBranchProps,
            idNode: {
              type: "string",
              description: "Node path to read position for. Example: '/V/I/p/0'"
            }
          }
        }
      }
    }
  },

  {
    name: "set_node_position",
    description: [
      "Set the visual canvas position of a single node and commit.",
      "Use after creating a node to place it at specific x,y coordinates on the diagram.",
      "Returns: { commitHash, status }."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project", "idNode", "position"],
          description: "Position update",
          properties: {
            ...projectBranchProps,
            idNode: {
              type: "string",
              description: "Node path to reposition. Example: '/V/I/p/0'"
            },
            position: {
              type: "object",
              required: ["x", "y"],
              description: "Canvas coordinates. Example: { x: 200, y: 100 }",
              properties: {
                x: { type: "number", description: "Canvas X coordinate (increases left-to-right)" },
                y: { type: "number", description: "Canvas Y coordinate (increases top-to-bottom)" }
              }
            },
            commitMessage: { type: "string", description: "Commit message. Example: 'Place FR_01 on canvas'" }
          }
        }
      }
    }
  },

  {
    name: "set_nodes_position",
    description: [
      "Set the visual canvas positions of multiple nodes in a single commit.",
      "Prefer this over set_node_position when laying out several nodes after batch creation.",
      "Place nodes left-to-right (increasing x) or top-to-bottom (increasing y); use y offsets for branches and parallel paths.",
      "Returns: { commitHash, status }."
    ].join(" "),
    inputSchema: {
      type: "object",
      required: ["bearerToken", "body"],
      properties: {
        ...bearerTokenProp,
        body: {
          type: "object",
          required: ["project", "nodePositionList"],
          description: "Batch position update",
          properties: {
            ...projectBranchProps,
            commitMessage: { type: "string", description: "Commit message. Example: 'Layout functional requirements'" },
            nodePositionList: {
              type: "array",
              description: "List of node positions to set",
              items: {
                type: "object",
                required: ["idNode", "position"],
                properties: {
                  idNode: { type: "string", description: "Node path. Example: '/V/I/p/0'" },
                  position: {
                    type: "object",
                    required: ["x", "y"],
                    description: "Canvas coordinates",
                    properties: {
                      x: { type: "number", description: "Canvas X coordinate" },
                      y: { type: "number", description: "Canvas Y coordinate" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
];

// Tool handlers

const toolHandlers = {
  login: { method: "post", path: "/login" },
  get_meta_elements_by_type: { method: "post", path: "/getMetaElementsByMetatype" },
  get_metamodel: { method: "post", path: "/getMetaDescription" },
  get_elements_by_type: { method: "post", path: "/getElementsByMetatype" },
  get_elements_by_name: { method: "post", path: "/getElementsByName" },
  get_elements_under_node: { method: "post", path: "/getElementsByNode" },
  get_children: { method: "post", path: "/getChildrenElements" },
  get_pointer_elements: { method: "post", path: "/getPointerElements" },
  get_set_elements: { method: "post", path: "/getSetElements" },
  create_nodes: { method: "post", path: "/createNodes" },
  modify_nodes: { method: "post", path: "/modifyNodes" },
  create_pointers: { method: "post", path: "/createPointers" },
  update_pointers: { method: "post", path: "/modifyPointers" },
  delete_pointers: { method: "post", path: "/deletePointers" },
  create_sets: { method: "post", path: "/createSets" },
  update_sets: { method: "post", path: "/modifySets" },
  delete_sets: { method: "post", path: "/deleteSets" },
  delete_nodes: { method: "post", path: "/deleteNodes" },
  get_node_position: { method: "post", path: "/getNodePosition" },
  set_node_position: { method: "post", path: "/setNodePosition" },
  set_nodes_position: { method: "post", path: "/setNodesPosition" },
};

function applyReadSafetyPolicyToTools(toolList) {
  if (ALLOW_FULL_TREE_READS || ALLOW_RECURSIVE_TREE_READS) return toolList;

  return toolList.filter((tool) => !recursiveTreeReadToolNames.has(tool.name));
}

const mcpTools = applyReadSafetyPolicyToTools(tools);
const mcpToolHandlers = toolHandlers;

// Prompts

const prompts = [
  {
    name: "vibe-modelling",
    description: "Sets up the agent as a WebGME MBSE vibe-modelling assistant. Invoke this at the start of a modelling session.",
    arguments: [
      {
        name: "project",
        description: "Project identifier to work on, e.g. 'guest+MyProject'",
        required: false,
      },
      {
        name: "branch",
        description: "Branch to work on. Defaults to 'master'",
        required: false,
      },
    ],
  },
];

function getVibeModellingPrompt(project, branch) {
  const projectHint = project
    ? `The active project is **${project}** on branch **${branch ?? "master"}**.`
    : "Ask the user for the project name (format: `owner+ProjectName`) and branch if not yet provided.";

  return `You are a WebGME MBSE (Model-Based Systems Engineering) vibe-modelling agent.
Your role is to help users create, navigate, and evolve systems engineering models stored in a WebGME server by interpreting natural language instructions and translating them into precise model operations.

${projectHint}

## Mandatory workflow
1. **Start as a vibe-modelling agent** - introduce yourself briefly as a WebGME MBSE vibe-modelling assistant.
2. **Collect session details** - if not already provided, ask the user for WebGME username/password, project in \`owner+ProjectName\` format, and branch (default \`master\`).
3. **Explain what you can do** - briefly mention you can inspect the metamodel/model, create/update/delete nodes, connect elements with pointers/sets, and arrange diagrams with x,y positions.
4. **Login once credentials are available** - call \`login\` to obtain a bearerToken. Reuse it for the session and do not expose the token back to the user unless explicitly needed for debugging.
5. **Discover the metamodel** - call \`get_metamodel\` to know which types exist (e.g. FunctionalRequirement, SysBlock). Type names are case-sensitive.
6. **Read before writing** - query the current model state before making changes so you operate on accurate node ids.
7. **Use safe reads** - never request the whole containment tree. Do not call recursive subtree tools or unfiltered instance queries; use exact metatype/name filters, pointers, sets, or known node ids.
8. **Write and commit** - use the write tools (\`create_nodes\`, \`modify_nodes\`, \`create_pointers\`, etc.) and always include a meaningful \`commitMessage\`.
9. **Confirm destructive operations** - always show the user what will be changed/deleted before calling any write tool.

## Session kickoff
At the beginning of a modelling session, if credentials/project are missing, ask for only the minimum information needed:
- WebGME username.
- WebGME password.
- Project identifier, e.g. \`guest+AutomobileProject\`.
- Branch name, defaulting to \`master\` if the user does not specify one.

After collecting that information, login, discover the metamodel, then summarize the available modelling capabilities in the context of the discovered types.

## Translating natural language to operations
| User says | Tool to use |
|---|---|
| "Create requirement X under Y" | \`create_nodes\` with metaType from metamodel |
| "Link A to B as refinement" | \`create_pointers\` with pointerName='refines' |
| "Allocate requirement to component" | \`create_sets\` / addSetMembers with setName='allocatedTo' |
| "Show me all functional requirements" | \`get_elements_by_type\` |
| "Move / rename / update attribute" | \`modify_nodes\` with op='moveNode' / 'updateAttributes' |
| "Arrange / place / move visually" | \`set_node_position\` or \`set_nodes_position\` |
| "Where is this node on the canvas?" | \`get_node_position\` |
| "Delete element X" | \`delete_nodes\` |
| "What types exist in this model?" | \`get_metamodel\` |

## Flow-style diagram workflow
When the user asks for a flow, pipeline, process, sequence, activity, state flow, data flow, or any diagram where connected elements should read as a flow:
1. Discover the metamodel first to understand whether connectors are model nodes, pointers, sets, or a combination.
2. Create the main flow elements first. Use \`tempId\` values so later operations can refer to newly created elements.
3. Create connectors/relationships after the endpoints exist. If connectors are meta elements, create connector nodes and attach their source/target pointers or sets. If relationships are pointers/sets, use \`create_pointers\`, \`create_sets\`, or \`modify_nodes\`.
4. Set visual positions after creation with \`set_nodes_position\`. Choose x,y coordinates from the flow topology, not arbitrary positions.
5. Use left-to-right or top-to-bottom placement unless the user requests another direction. Increase x for sequential flow steps; use y offsets for branches, alternatives, loops, or parallel lanes.
6. Keep connected elements visually close, avoid overlaps, and place connector nodes midway between their source and target when connectors are visible nodes.
7. Prefer one batch commit for semantic creation, one batch commit for relationships, and one batch commit for layout unless \`modify_nodes\` can safely combine them.

## Key WebGME concepts
- **idNode**: unique node path like \`/V/I/p/0\`. Always obtained from query results (\`id\` field) - never invent one.
- **project**: format \`owner+ProjectName\`, e.g. \`guest+AutomobileProject\`.
- **branch-commit**: branch name (e.g. \`master\`) or a commit hash.
- **pointer**: singular named reference from one node to another (one-to-one). Think typed foreign key. Managed with \`create_pointers\` / \`update_pointers\` / \`delete_pointers\`.
- **set**: named multi-valued collection of node references (one-to-many). Think typed list of foreign keys. Managed with \`create_sets\` / \`update_sets\` / \`delete_sets\`, or incrementally via \`modify_nodes\` ops (addSetMembers, removeSetMembers, replaceSetMembers).
- **position**: visual canvas coordinates stored as registry data. Read with \`get_node_position\`; write one node with \`set_node_position\` or many with \`set_nodes_position\`.
- **meta element**: a type definition in the metamodel (the "class"). Read with \`get_metamodel\`.
- **instance element**: an actual model node (the "object"). Read with \`get_elements_by_type\`, \`get_elements_by_name\`, etc.
- **tempId**: local alias used within a single batch \`create_nodes\` or \`modify_nodes\` call to reference new nodes before they have real ids.

## Style guidelines
- Prefer \`modify_nodes\` for multi-step changes in one atomic commit.
- Use \`tempId\` to chain node creation within a single batch.
- Use \`set_nodes_position\` after creating several nodes so the diagram opens in a readable layout.
- Keep commit messages descriptive for traceability (e.g. "Add FR_01 and link to braking subsystem").
- When unsure of a type name, always query the metamodel first rather than guessing.
- Read the \`webgme-concepts\` resource for a detailed reference on any concept above.`;
}

// Resources

const CONCEPTS_RESOURCE_URI = "webgme://concepts";

const resources = [
  {
    uri: CONCEPTS_RESOURCE_URI,
    name: "WebGME Concepts Reference",
    description: "Explains WebGME core concepts: nodes, idNode paths, project format, pointers vs sets, meta vs instance elements, batch operations, and the modify_nodes operation table.",
    mimeType: "text/markdown",
  },
];

const conceptsResourceContent = `# WebGME Concepts Reference

## Projects and branches
- **project**: Identified as \`owner+ProjectName\`, e.g. \`guest+AutomobileProject\`. Always required in every API call.
- **branch-commit**: Branch name (e.g. \`master\`) or a specific commit hash. Determines which snapshot is read or written. Defaults to \`master\` if omitted.

## Nodes
Every model element is a **node**. A node has:
| Field | Description | Example |
|---|---|---|
| \`id\` | Unique path within the project | \`/V/I/p/0\` |
| \`name\` | Human-readable label | \`FR_01\` |
| \`metaName\` | Type name from the metamodel | \`FunctionalRequirement\` |
| \`parentId\` | Path of the containing parent node | \`/V/I/p\` |
| \`attributes\` | Key-value domain properties | \`{ description: "...", priority: "High" }\` |

## idNode paths
- Format: \`/V/I/p/0\` (opaque alphanumeric segments separated by \`/\`).
- Always obtained from the \`id\` field of a query response - **never invent or guess a path**.
- Use \`ROOT\` as \`parentRef\` when creating top-level nodes under the project root.

## Meta elements vs instance elements
| | Meta element | Instance element |
|---|---|---|
| What it is | Type definition ("class") | Actual model node ("object") |
| Read with | \`get_metamodel\`, \`getMetaElementsByMetatype\` | \`get_elements_by_type\`, \`get_elements_by_name\`, \`getElementsByNode\` |
| Used for | Knowing what types exist | Working with real model content |

Type names are **case-sensitive**. Always call \`get_metamodel\` on the target project to get exact names.

## Pointers - one-to-one named references
A **pointer** is a named, singular directional reference from one node to another.
- Semantics: like a typed foreign key. Node A "refines" node B.
- A node can have multiple pointers with different names, but each name points to exactly one target.
- Example: \`/V/I/p/0\` -> (refines) -> \`/V/I/p/1\`
- Common names (project-dependent): \`refines\`, \`satisfies\`, \`verifies\`, \`base\`, \`allocatedTo\`
- CRUD: \`create_pointers\` / \`update_pointers\` / \`delete_pointers\`
- Also manageable via \`modify_nodes\` with ops \`setPointer\` / \`clearPointer\`

## Sets - one-to-many named collections
A **set** is a named, multi-valued collection of node references owned by a node.
- Semantics: like a typed list of foreign keys. Node A "allocatedTo" [B, C, D].
- Example: \`/V/I/p/0\` -> (allocatedTo) -> [\`/V/I/p/1\`, \`/V/I/p/2\`]
- Common names (project-dependent): \`allocatedTo\`, \`verifies\`, \`implements\`, \`satisfies\`
- CRUD (full replace): \`create_sets\` / \`update_sets\` / \`delete_sets\`
- Incremental via \`modify_nodes\`: \`addSetMembers\`, \`removeSetMembers\`, \`replaceSetMembers\`

## Containment tree
Nodes form a strict containment hierarchy (each node has exactly one parent).
- \`getChildrenElements\` - direct and recursive children of a node.
- \`getElementsByNode\` - all descendants recursively, optionally filtered by metaElementType.
- These recursive reads are disabled by default in the MCP server because broad subtree reads can overload the MBSE4SDV API. Prefer filtered reads by metatype/name and only enable recursive reads for trusted sessions.
- Specify \`parentRef\` when creating nodes to control placement.

## Visual positions
WebGME stores visual canvas placement in node registry data under \`position\`.
- \`get_node_position\` reads the current \`{ x, y }\` coordinates for a node, or null if unset.
- \`set_node_position\` moves one node and commits the change.
- \`set_nodes_position\` moves multiple nodes in a single commit, which is best after batch creation.
- Position changes are visual/layout changes only; they do not change containment, attributes, pointers or sets.

## Flow-style diagram layout
For diagrams that represent a flow, the model should be created in a topology-aware order:
- Create the main elements first.
- Create connectors or relationships after their endpoints exist.
- Set positions after the semantic structure is known.
- Use \`set_nodes_position\` to place connected elements as a readable flow.
- Prefer left-to-right or top-to-bottom direction unless the user asks otherwise.
- Increase \`x\` for sequential steps in left-to-right flows; increase \`y\` for top-to-bottom flows.
- Use secondary \`y\` offsets for branches, alternatives, parallel paths, loops or swimlanes.
- Keep connected elements near each other and avoid overlapping nodes.
- If connectors are visible model nodes, place them between their source and target nodes.

## Batch operations and tempId
When creating or modifying multiple nodes in one call:
- Assign \`tempId\` to new nodes (e.g. \`"fr_1"\`) to reference them within the same batch.
- Use the \`tempId\` as \`parentRef\` in other entries of the same list.
- The server resolves all references atomically before committing - no round-trips needed.

## modify_nodes operation reference
\`modify_nodes\` is the most powerful write tool - it applies a mixed list of operations in a single commit.

| op | Key fields | Description |
|---|---|---|
| \`createNode\` | \`parentRef\`, \`metaType\`, \`name\`, \`attributes\`, \`tempId\` | Create a new node |
| \`moveNode\` | \`idNode\`, \`parentRef\` | Move node to a different parent |
| \`updateAttributes\` | \`idNode\`, \`attributes\` | Set or overwrite attribute values |
| \`updateRegistry\` | \`idNode\`, \`registry\` | Set registry values (visual/display props) |
| \`createSet\` | \`idNode\`, \`setName\` | Create an empty named set on a node |
| \`deleteSet\` | \`idNode\`, \`setName\` | Delete an entire set from a node |
| \`addSetMembers\` | \`idNode\`, \`setName\`, \`members\` | Append members to an existing set |
| \`removeSetMembers\` | \`idNode\`, \`setName\`, \`members\` | Remove specific members from a set |
| \`replaceSetMembers\` | \`idNode\`, \`setName\`, \`members\` | Replace all set members |
| \`setPointer\` | \`idNode\`, \`pointerName\`, \`targetRef\` | Assign a pointer to a target node |
| \`clearPointer\` | \`idNode\`, \`pointerName\` | Remove a pointer |
| \`deleteNode\` | \`idNode\` | Delete node and all its children |

## Typical MBSE metamodel types (project-dependent)
Always verify with \`get_metamodel\` - these are illustrative examples:
- Requirements: \`FunctionalRequirement\`, \`NonFunctionalRequirement\`, \`DesignConstraint\`
- Architecture: \`SysBlock\`, \`SubSystem\`, \`Component\`, \`Module\`
- Interfaces: \`Interface\`, \`Port\`, \`FlowPort\`
- Verification: \`TestCase\`, \`VerificationActivity\`
- Traceability: \`TraceLink\`, \`Allocation\`
`;

// Server

class McpReadPolicyError extends Error {
  constructor(message) {
    super(`Blocked by MCP read safety policy: ${message}`);
    this.name = "McpReadPolicyError";
  }
}

function getToolBody(args) {
  const body = args?.body;
  return body && typeof body === "object" && !Array.isArray(body) ? body : {};
}

function hasUsableFilter(value) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => hasUsableFilter(item));
  return value !== undefined && value !== null;
}

function getNodeSelector(body) {
  for (const key of ["idNode", "nodeId", "node"]) {
    if (body[key] !== undefined) return body[key];
  }

  return undefined;
}

function isRootOrMissingNodeSelector(value) {
  if (typeof value !== "string") return true;

  const normalized = value.trim();
  return normalized === "" || normalized === "/" || normalized.toUpperCase() === "ROOT";
}

function getNodePathDepth(value) {
  if (typeof value !== "string") return 0;
  return value.split("/").filter(Boolean).length;
}

function isTruthyFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  return false;
}

function formatValueForError(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "<empty>";
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function assertSafeMcpRead(name, handler, args) {
  if (ALLOW_FULL_TREE_READS) return;

  const path = handler.path.toLowerCase();
  const body = getToolBody(args);
  const isRecursiveTreeRead =
    path === "/getelementsbynode" ||
    path === "/getchildrenelements" ||
    recursiveTreeReadToolNames.has(name);

  if (path === "/getelementsbymetatype" && !hasUsableFilter(body.metaElementType)) {
    throw new McpReadPolicyError(
      "get_elements_by_type must include a non-empty metaElementType filter. " +
        "Omitting it asks the API for every instance in the model."
    );
  }

  if (
    path === "/getelementsbyname" &&
    !hasUsableFilter(body.elementName) &&
    !hasUsableFilter(body.name)
  ) {
    throw new McpReadPolicyError(
      "get_elements_by_name must include a non-empty elementName or name filter. " +
        "Omitting it can degrade into a full-model read."
    );
  }

  if (
    !ALLOW_RECURSIVE_TREE_READS &&
    isTruthyFlag(body.showChildren) &&
    ["/getelementsbymetatype", "/getelementsbyname", "/getelementsbynode"].includes(path)
  ) {
    throw new McpReadPolicyError(
      "showChildren=true is disabled by default because it can expand containment data recursively. " +
        "Use a narrower query without showChildren, or enable MCP_ALLOW_RECURSIVE_TREE_READS=true for trusted sessions."
    );
  }

  if (!isRecursiveTreeRead) return;

  if (!ALLOW_RECURSIVE_TREE_READS) {
    throw new McpReadPolicyError(
      `${name} is a recursive containment-tree read and is disabled by default. ` +
        "Use filtered get_elements_by_type/get_elements_by_name calls, or enable MCP_ALLOW_RECURSIVE_TREE_READS=true for trusted sessions."
    );
  }

  const nodeSelector = getNodeSelector(body);
  if (isRootOrMissingNodeSelector(nodeSelector)) {
    throw new McpReadPolicyError(
      `${name} must include an explicit, non-root idNode/nodeId/node. ` +
        "Omitting it, or using ROOT, reads from the project root."
    );
  }

  const depth = getNodePathDepth(nodeSelector);
  if (depth < MIN_RECURSIVE_READ_NODE_DEPTH) {
    throw new McpReadPolicyError(
      `${name} target ${formatValueForError(nodeSelector)} is too close to the root ` +
        `(depth ${depth}; minimum ${MIN_RECURSIVE_READ_NODE_DEPTH}). ` +
        "Use a deeper node path or lower MCP_MIN_RECURSIVE_READ_NODE_DEPTH for trusted projects."
    );
  }
}

function formatAxiosError(error) {
  if (error instanceof McpReadPolicyError) {
    return error.message;
  }

  if (error.response) {
    return `Error ${error.response.status}: ${JSON.stringify(error.response.data)}`;
  }

  return `Error: ${error.message}`;
}

function createServer() {
  const server = new Server(
    {
      name: "mbse4sdv",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
      },
      instructions: getVibeModellingPrompt(),
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpTools }));

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name !== "vibe-modelling") throw new Error(`Unknown prompt: ${name}`);
    return {
      description: prompts[0].description,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: getVibeModellingPrompt(args?.project, args?.branch),
          },
        },
      ],
    };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri !== CONCEPTS_RESOURCE_URI) {
      throw new Error(`Unknown resource: ${request.params.uri}`);
    }
    return {
      contents: [
        {
          uri: CONCEPTS_RESOURCE_URI,
          mimeType: "text/markdown",
          text: conceptsResourceContent,
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = mcpToolHandlers[name];

    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      assertSafeMcpRead(name, handler, args);
      const response = await axios(buildAxiosConfig(handler.method, handler.path, args));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response.data, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: formatAxiosError(error),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// Transport

async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`MBSE4SDV MCP Server running on stdio -> ${BASE_URL}`);
}

async function startHttpServer() {
  const app = express();
  app.use(express.json());

  const sessions = new Map();

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      transport: "streamable-http",
      endpoint: "/mcp",
      baseUrl: BASE_URL,
    });
  });

  // --- Streamable HTTP transport (MCP spec 2025-03-26) ---
  // POST /mcp: initialize (no session header) or send a message (with session header)
  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];

    if (sessionId) {
      const transport = sessions.get(sessionId);
      if (!transport) {
        res.status(404).json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Session not found" } });
        return;
      }
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // New session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => sessions.set(sid, transport),
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    const server = createServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // GET /mcp: open SSE stream for server-initiated messages (requires active session)
  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    const transport = sessions.get(sessionId);
    if (!transport) {
      res.status(400).json({ error: "Invalid or missing Mcp-Session-Id header" });
      return;
    }
    await transport.handleRequest(req, res);
  });

  // DELETE /mcp: terminate session
  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    const transport = sessions.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await transport.handleRequest(req, res);
    sessions.delete(sessionId);
  });

  app.listen(PORT, HOST, () => {
    console.error(`MBSE4SDV MCP Server running on http://${HOST}:${PORT}/mcp -> ${BASE_URL}`);
  });
}

async function main() {
  if (MCP_TRANSPORT === "http") {
    await startHttpServer();
    return;
  }

  await startStdioServer();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
