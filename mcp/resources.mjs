import fs from "node:fs/promises";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getProjectOrThrow,
  projectToGraph,
  projectToMarkdown,
  summarizeWorkspace,
  workspaceSchema,
} from "./operations.mjs";
import { getCardPreview } from "../src/lib/workspaceModel.js";
import {
  closeDatabase,
  getImageAsset,
  getWorkspaceMetadata,
  listImageAssets,
  loadWorkspace,
  openDatabase,
} from "./storage.mjs";
import {
  jsonResource,
  resourceNotFound,
  textResource,
  withDatabase,
} from "./shared.mjs";

export function registerResources(server) {
  server.registerResource(
    "workspace-summary",
    "infinimind://workspace/summary",
    {
      title: "InfiniMind Workspace Summary",
      description: "Project counts and storage metadata.",
      mimeType: "application/json",
    },
    async (uri) =>
      jsonResource(uri, withDatabase((database) => summarizeWorkspace(loadWorkspace(database), getWorkspaceMetadata(database))))
  );

  server.registerResource(
    "workspace-raw",
    "infinimind://workspace/raw",
    {
      title: "InfiniMind Raw Workspace",
      description: "Full normalized workspace JSON.",
      mimeType: "application/json",
    },
    async (uri) => jsonResource(uri, withDatabase((database) => loadWorkspace(database)))
  );

  server.registerResource(
    "workspace-schema",
    "infinimind://schema/workspace-state-v1",
    {
      title: "InfiniMind Workspace Schema",
      description: "JSON Schema for the MCP-exposed workspace state.",
      mimeType: "application/json",
    },
    async (uri) => jsonResource(uri, workspaceSchema())
  );

  server.registerResource(
    "project-json",
    new ResourceTemplate("infinimind://project/{projectId}", {
      list: async () => ({
        resources: withDatabase((database) =>
          loadWorkspace(database).projects.map((project) => ({
            uri: `infinimind://project/${project.id}`,
            name: project.name,
            mimeType: "application/json",
          }))
        ),
      }),
    }),
    {
      title: "InfiniMind Project",
      description: "Single project JSON.",
      mimeType: "application/json",
    },
    async (uri, { projectId }) => jsonResource(uri, withDatabase((database) => getProjectOrThrow(loadWorkspace(database), projectId)))
  );

  server.registerResource(
    "project-markdown",
    new ResourceTemplate("infinimind://project/{projectId}/markdown", {
      list: async () => ({
        resources: withDatabase((database) =>
          loadWorkspace(database).projects.map((project) => ({
            uri: `infinimind://project/${project.id}/markdown`,
            name: `${project.name} Markdown`,
            mimeType: "text/markdown",
          }))
        ),
      }),
    }),
    {
      title: "InfiniMind Project Markdown",
      description: "LLM-friendly project markdown.",
      mimeType: "text/markdown",
    },
    async (uri, { projectId }) =>
      textResource(uri, withDatabase((database) => projectToMarkdown(getProjectOrThrow(loadWorkspace(database), projectId), { includeTrash: true })), "text/markdown")
  );

  server.registerResource(
    "project-graph",
    new ResourceTemplate("infinimind://project/{projectId}/graph", {
      list: async () => ({
        resources: withDatabase((database) =>
          loadWorkspace(database).projects.map((project) => ({
            uri: `infinimind://project/${project.id}/graph`,
            name: `${project.name} Graph`,
            mimeType: "application/json",
          }))
        ),
      }),
    }),
    {
      title: "InfiniMind Project Graph",
      description: "Project graph nodes and edges.",
      mimeType: "application/json",
    },
    async (uri, { projectId }) => jsonResource(uri, withDatabase((database) => projectToGraph(getProjectOrThrow(loadWorkspace(database), projectId))))
  );

  server.registerResource(
    "project-trash",
    new ResourceTemplate("infinimind://project/{projectId}/trash", {
      list: async () => ({
        resources: withDatabase((database) =>
          loadWorkspace(database).projects.map((project) => ({
            uri: `infinimind://project/${project.id}/trash`,
            name: `${project.name} Trash`,
            mimeType: "application/json",
          }))
        ),
      }),
    }),
    {
      title: "InfiniMind Project Trash",
      description: "Recoverable trash for a project.",
      mimeType: "application/json",
    },
    async (uri, { projectId }) => jsonResource(uri, withDatabase((database) => getProjectOrThrow(loadWorkspace(database), projectId).field.trash))
  );

  server.registerResource(
    "set-json",
    new ResourceTemplate("infinimind://set/{projectId}/{setId}", {
      list: async () => ({
        resources: withDatabase((database) =>
          loadWorkspace(database).projects.flatMap((project) =>
            project.field.sets.map((set) => ({
              uri: `infinimind://set/${project.id}/${set.id}`,
              name: `${project.name}: ${set.title}`,
              mimeType: "application/json",
            }))
          )
        ),
      }),
    }),
    {
      title: "InfiniMind Card Set",
      description: "Single card set JSON.",
      mimeType: "application/json",
    },
    async (uri, { projectId, setId }) =>
      jsonResource(uri, withDatabase((database) => getProjectOrThrow(loadWorkspace(database), projectId).field.sets.find((set) => set.id === setId) || resourceNotFound(`Set not found: ${setId}`)))
  );

  server.registerResource(
    "card-json",
    new ResourceTemplate("infinimind://card/{projectId}/{setId}/{cardId}", {
      list: async () => ({
        resources: withDatabase((database) =>
          loadWorkspace(database).projects.flatMap((project) =>
            project.field.sets.flatMap((set) =>
              set.cards.map((card) => ({
                uri: `infinimind://card/${project.id}/${set.id}/${card.id}`,
                name: `${project.name}: ${set.title}: ${getCardName(card)}`,
                mimeType: "application/json",
              }))
            )
          )
        ),
      }),
    }),
    {
      title: "InfiniMind Card",
      description: "Single card JSON.",
      mimeType: "application/json",
    },
    async (uri, { projectId, setId, cardId }) =>
      jsonResource(
        uri,
        withDatabase((database) => {
          const project = getProjectOrThrow(loadWorkspace(database), projectId);
          const set = project.field.sets.find((item) => item.id === setId) || resourceNotFound(`Set not found: ${setId}`);
          return set.cards.find((card) => card.id === cardId) || resourceNotFound(`Card not found: ${cardId}`);
        })
      )
  );

  server.registerResource(
    "image-asset",
    new ResourceTemplate("infinimind://image/{imageId}", {
      list: async () => ({
        resources: withDatabase((database) =>
          listImageAssets(database).map((asset) => ({
            uri: `infinimind://image/${asset.id}`,
            name: asset.originalName || asset.id,
            mimeType: asset.mime,
          }))
        ),
      }),
    }),
    {
      title: "InfiniMind Image Asset",
      description: "Image asset bytes managed by InfiniMind.",
    },
    async (uri, { imageId }) => {
      const database = openDatabase();
      try {
        const asset = getImageAsset(database, imageId);
        if (!asset) {
          resourceNotFound(`Image not found: ${imageId}`);
        }
        const bytes = await fs.readFile(asset.path);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: asset.mime,
              blob: bytes.toString("base64"),
            },
          ],
        };
      } finally {
        closeDatabase(database);
      }
    }
  );
}

function getCardName(card) {
  const preview = getCardPreview(card);
  return preview.length > 48 ? `${preview.slice(0, 45)}...` : preview;
}
