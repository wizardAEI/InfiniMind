import { getConnectionLayerNode, getConnectionLayerNodes, getNodeCenter } from "../lib/canvasGeometry.js";
import { getConnectionNodeIds } from "../lib/workspaceModel.js";

function ConnectionLayer({
  connections,
  nodeLookup,
  editingSetId,
  pendingConnection,
  selectedConnectionId,
  dragPreview,
  onSelectConnection,
}) {
  const pendingFromNodeId = pendingConnection ? getConnectionNodeIds(pendingConnection).fromNodeId : null;
  const pendingFromNode = pendingConnection ? getConnectionLayerNode(pendingFromNodeId, nodeLookup, dragPreview) : null;
  const pendingFrom = pendingFromNode
    ? getNodeCenter(pendingFromNode, editingSetId === pendingFromNodeId)
    : { x: 0, y: 0 };

  return (
    <svg className="connection-layer" aria-hidden="true">
      {connections.map((connection) => {
        const { fromNode, toNode } = getConnectionLayerNodes(connection, nodeLookup, dragPreview);
        if (!fromNode || !toNode) {
          return null;
        }

        const from = getNodeCenter(fromNode, editingSetId === fromNode.id);
        const to = getNodeCenter(toNode, editingSetId === toNode.id);
        const isSelected = connection.id === selectedConnectionId;

        return (
          <g key={connection.id}>
            <line
              className="connection-line-hit"
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              onClick={(event) => {
                event.stopPropagation();
                onSelectConnection(connection.id);
              }}
            />
            <line
              className={`connection-line ${isSelected ? "is-selected" : ""}`}
              data-marker-color={connection.color || "none"}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          </g>
        );
      })}
      {pendingConnection && (
        <line
          className="connection-line pending-connection-line"
          x1={pendingFrom.x}
          y1={pendingFrom.y}
          x2={pendingConnection.x}
          y2={pendingConnection.y}
        />
      )}
    </svg>
  );
}

export default ConnectionLayer;
