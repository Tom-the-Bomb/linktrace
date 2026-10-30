import type { GraphEdge } from '../api';

// the worker records one edge per page (where first found), so edges form a tree
export interface SiteTree {
  parent: Map<string, string>;
  children: Map<string, string[]>;
}

export function buildTree(edges: GraphEdge[]): SiteTree {
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();
  for (const e of edges) {
    parent.set(e.target, e.source);
    const list = children.get(e.source);
    if (list) {
      list.push(e.target);
    } else {
      children.set(e.source, [e.target]);
    }
  }
  return { parent, children };
}

// the includes check stops a malformed cycle
export function pathFromRoot(tree: SiteTree, url: string): string[] {
  const chain = [url];
  for (let p = tree.parent.get(url); p && !chain.includes(p); p = tree.parent.get(p)) {
    chain.push(p);
  }
  return chain.reverse();
}

export function depthLabel(depth: number): string {
  return depth === 0
    ? 'Homepage'
    : `${depth} ${depth === 1 ? 'click' : 'clicks'} from the homepage`;
}

export function nodeNote(depth: number, foundOn: string | undefined, found: number): string[] {
  return [
    depthLabel(depth),
    ...(foundOn ? [`First found on ${foundOn}`] : []),
    ...(found > 0 ? [`${found} ${found === 1 ? 'page was' : 'pages were'} first found here`] : []),
  ];
}
