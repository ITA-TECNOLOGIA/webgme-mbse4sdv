# MBSE4SDV MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets LLM clients (Claude, GPT, ...)
query and edit MBSE4SDV models. It exposes the MBSE4SDV WebGME REST API (`/mbse4sdv/api`, provided by the
`Mbse4sdvApi` router of the WebGME application) as MCP tools.

## How authentication works

The MCP server holds no credentials. The LLM first calls the `login` tool with the user's WebGME username
and password, receives a Bearer token and passes it (`bearerToken`) in every other tool call. Every model
change is therefore made with the permissions of that user and recorded as a WebGME commit.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:8888/mbse4sdv/api` | URL of the MBSE4SDV REST API |
| `MCP_TRANSPORT` | `stdio` | `stdio` (local clients) or `http` (Streamable HTTP on `/mcp`) |
| `HOST` / `PORT` | `0.0.0.0` / `3000` | Listening address when `MCP_TRANSPORT=http` |
| `MCP_ALLOW_FULL_TREE_READS` | `false` | Allow unfiltered reads of whole model trees |
| `MCP_ALLOW_RECURSIVE_TREE_READS` | value of `MCP_ALLOW_FULL_TREE_READS` | Expose the recursive `get_elements_under_node` / `get_children` tools |
| `MCP_MIN_RECURSIVE_READ_NODE_DEPTH` | `4` | Minimum node depth for recursive reads when they are enabled |

Recursive subtree reads are disabled by default because they can overload the API on large models; prefer
filtered reads by meta type or name.

## Usage

```bash
npm install
npm start                                   # stdio transport
MCP_TRANSPORT=http PORT=3000 npm start      # Streamable HTTP transport at http://localhost:3000/mcp
```

### Claude Desktop (stdio)

```json
{
  "mcpServers": {
    "mbse4sdv": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/server.js"],
      "env": { "BASE_URL": "http://localhost:8888/mbse4sdv/api" }
    }
  }
}
```

When the whole stack is started with Docker (see the repository root), the HTTP transport is available at
`http://localhost:3000/mcp`.

## Tools

| Tool | REST operation | Purpose |
|------|----------------|---------|
| `login` | `POST /login` | Obtain a Bearer token |
| `get_metamodel` | `POST /getMetaDescription` | Describe all meta types of a project |
| `get_meta_elements_by_type` | `POST /getMetaElementsByMetatype` | Describe selected meta types |
| `get_elements_by_type` | `POST /getElementsByMetatype` | Instances of a meta type |
| `get_elements_by_name` | `POST /getElementsByName` | Instances filtered by name |
| `get_elements_under_node` | `POST /getElementsByNode` | Recursive subtree read (disabled by default) |
| `get_children` | `POST /getChildrenElements` | Children of a node (recursive variant disabled by default) |
| `get_pointer_elements` / `get_set_elements` | `POST /getPointerElements`, `/getSetElements` | Pointers and sets of nodes |
| `create_nodes` / `modify_nodes` / `delete_nodes` | `POST /createNodes`, `/modifyNodes`, `/deleteNodes` | Batch node editing |
| `create_pointers` / `update_pointers` / `delete_pointers` | `POST /createPointers`, `/modifyPointers`, `/deletePointers` | Pointer editing |
| `create_sets` / `update_sets` / `delete_sets` | `POST /createSets`, `/modifySets`, `/deleteSets` | Set editing |
| `get_node_position` / `set_node_position` / `set_nodes_position` | `POST /getNodePosition`, `/setNodePosition`, `/setNodesPosition` | Diagram layout |

The full request/response contract is published by the running application at `GET /mbse4sdv/api/openapi`.

The server also provides a `vibe-modelling` prompt (sent automatically on initialization to compatible
clients) and a resource that explains WebGME modelling concepts to the LLM.
