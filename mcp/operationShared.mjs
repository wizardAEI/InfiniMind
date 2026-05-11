import { getConnectionNodeIds as getWorkspaceConnectionNodeIds } from "../src/lib/workspaceModel.js";

export function getProjectOrThrow(workspace, projectId) {
  const targetId = projectId || workspace.activeProjectId || workspace.projects?.[0]?.id;
  const project = workspace.projects?.find((item) => item.id === targetId);

  if (!project) {
    throw new Error(targetId ? `Project not found: ${targetId}` : "No project available.");
  }

  return project;
}

export function getConnectionNodeIdsForOperations(connection) {
  return getWorkspaceConnectionNodeIds(connection);
}

export function workspaceResourceLinks(projectId) {
  const links = {
    workspace: "infinimind://workspace/summary",
    raw: "infinimind://workspace/raw",
  };

  if (projectId) {
    links.project = `infinimind://project/${projectId}`;
    links.projectMarkdown = `infinimind://project/${projectId}/markdown`;
    links.graph = `infinimind://project/${projectId}/graph`;
    links.trash = `infinimind://project/${projectId}/trash`;
  }

  return links;
}
