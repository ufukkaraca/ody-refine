/**
 * Linear GraphQL API client for Ody Refine.
 * Thin fetch-based client with retry and rate-limit handling.
 * No SDK dependency — uses raw fetch against https://api.linear.app/graphql.
 * @module connectors/linear-api
 */
import { ConnectorError } from './types.js';

/** Linear GraphQL API endpoint. */
const LINEAR_API_URL = 'https://api.linear.app/graphql';

/** Maximum number of retries for failed requests. */
const MAX_RETRIES = 3;

/** Initial backoff in ms for retries (doubles each attempt). */
const INITIAL_BACKOFF_MS = 1_000;

/** Minimum delay between requests in ms (~50 req/min). */
const MIN_DELAY_MS = 1_200;

// --- Response types ---

/** Linear team from the API. */
export interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

/** Linear project from the API. */
export interface LinearProject {
  id: string;
  name: string;
  state: string;
  teamId: string;
  teamName: string;
}

/** Linear issue from the API. */
export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  updatedAt: string;
  state: { name: string };
  assignee: { name: string } | null;
  labels: { nodes: Array<{ name: string }> };
  comments: { nodes: Array<{ body: string; user: { name: string } | null }> };
  project: { id: string; name: string } | null;
}

/** Linear document from the API (project docs, wikis). */
export interface LinearDocument {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  creator: { name: string } | null;
  project: { id: string; name: string } | null;
}

/** Generic GraphQL response wrapper. */
interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

// --- API client ---

/**
 * Low-level Linear GraphQL client with built-in rate limiting and retries.
 */
export class LinearApiClient {
  private lastRequestAt = 0;

  constructor(private readonly accessToken: string) {}

  /** Execute a GraphQL query against the Linear API. */
  async query<T>(
    gql: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await this.rateLimit();

      const response = await fetch(LINEAR_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: gql, variables }),
      });

      if (response.status === 429) {
        const retryAfter = parseInt(
          response.headers.get('Retry-After') ?? '2', 10,
        );
        await sleep(retryAfter * 1_000);
        continue;
      }

      if (!response.ok) {
        lastError = new ConnectorError(
          'linear', 'query',
          `HTTP ${response.status} ${response.statusText}`,
        );
        if (attempt < MAX_RETRIES - 1) {
          await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
          continue;
        }
        throw lastError;
      }

      const json = (await response.json()) as GraphQLResponse<T>;
      if (json.errors?.length) {
        throw new ConnectorError(
          'linear', 'query', json.errors[0]!.message,
        );
      }
      if (!json.data) {
        throw new ConnectorError(
          'linear', 'query', 'Response missing data',
        );
      }
      return json.data;
    }

    throw lastError ?? new ConnectorError(
      'linear', 'query', 'Max retries exceeded',
    );
  }

  /** Validate the token by fetching the current user. */
  async validateToken(): Promise<boolean> {
    try {
      await this.query<{ viewer: { id: string } }>(VIEWER_QUERY);
      return true;
    } catch {
      return false;
    }
  }

  /** Fetch teams and their projects. */
  async fetchTeamsAndProjects(): Promise<{
    teams: LinearTeam[];
    projects: LinearProject[];
  }> {
    const data = await this.query<TeamsResponse>(TEAMS_QUERY);
    const teams: LinearTeam[] = [];
    const projects: LinearProject[] = [];

    for (const team of data.teams.nodes) {
      teams.push({ id: team.id, name: team.name, key: team.key });
      for (const project of team.projects.nodes) {
        projects.push({
          id: project.id,
          name: project.name,
          state: project.state,
          teamId: team.id,
          teamName: team.name,
        });
      }
    }
    return { teams, projects };
  }

  /** Fetch issues with pagination. Optionally filter by team IDs or date. */
  async fetchIssues(
    teamIds?: string[],
    updatedAfter?: string,
  ): Promise<LinearIssue[]> {
    const allIssues: LinearIssue[] = [];
    let cursor: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const variables: Record<string, unknown> = { after: cursor };
      if (teamIds?.length) variables['teamIds'] = teamIds;
      if (updatedAfter) variables['updatedAfter'] = updatedAfter;

      const data = await this.query<IssuesResponse>(
        ISSUES_QUERY, variables,
      );
      allIssues.push(...data.issues.nodes);
      hasMore = data.issues.pageInfo.hasNextPage;
      cursor = data.issues.pageInfo.endCursor;
    }
    return allIssues;
  }

  /** Fetch documents (project docs, wikis) with pagination. */
  async fetchDocuments(updatedAfter?: string): Promise<LinearDocument[]> {
    const allDocs: LinearDocument[] = [];
    let cursor: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const variables: Record<string, unknown> = { after: cursor };
      if (updatedAfter) variables['updatedAfter'] = updatedAfter;

      const data = await this.query<DocumentsResponse>(
        DOCUMENTS_QUERY, variables,
      );
      allDocs.push(...data.documents.nodes);
      hasMore = data.documents.pageInfo.hasNextPage;
      cursor = data.documents.pageInfo.endCursor;
    }
    return allDocs;
  }

  /** Enforce rate limit by sleeping if needed. */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < MIN_DELAY_MS) {
      await sleep(MIN_DELAY_MS - elapsed);
    }
    this.lastRequestAt = Date.now();
  }
}

// --- GraphQL queries ---

const VIEWER_QUERY = `query { viewer { id name email } }`;

const TEAMS_QUERY = `
  query {
    teams {
      nodes {
        id
        name
        key
        projects {
          nodes { id name state }
        }
      }
    }
  }
`;

const ISSUES_QUERY = `
  query($after: String, $teamIds: [String!], $updatedAfter: DateTime) {
    issues(
      first: 50
      after: $after
      filter: {
        team: { id: { in: $teamIds } }
        updatedAt: { gte: $updatedAfter }
      }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id identifier title description url updatedAt
        state { name }
        assignee { name }
        labels { nodes { name } }
        comments { nodes { body user { name } } }
        project { id name }
      }
    }
  }
`;

const DOCUMENTS_QUERY = `
  query($after: String, $updatedAfter: DateTime) {
    documents(
      first: 50
      after: $after
      filter: { updatedAt: { gte: $updatedAfter } }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title content updatedAt
        creator { name }
        project { id name }
      }
    }
  }
`;

// --- Internal types ---

interface TeamsResponse {
  teams: {
    nodes: Array<{
      id: string;
      name: string;
      key: string;
      projects: { nodes: Array<{ id: string; name: string; state: string }> };
    }>;
  };
}

interface IssuesResponse {
  issues: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: LinearIssue[];
  };
}

interface DocumentsResponse {
  documents: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: LinearDocument[];
  };
}

/** Promise-based sleep. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
