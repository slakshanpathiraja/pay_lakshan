interface TreeCard {
  id: number;
  parent_id: number | null;
}

/** Cards in tree order (each parent followed by its children), with their depth. */
export function orderAsTree<T extends TreeCard>(
  cards: T[],
): { card: T; depth: number }[] {
  const ids = new Set(cards.map((c) => c.id));
  const children = new Map<number | null, T[]>();
  for (const card of cards) {
    // a parent that isn't in the list (shouldn't happen) is treated as top level
    const parent =
      card.parent_id !== null && ids.has(card.parent_id)
        ? card.parent_id
        : null;
    children.set(parent, [...(children.get(parent) ?? []), card]);
  }
  const out: { card: T; depth: number }[] = [];
  const walk = (parent: number | null, depth: number) => {
    for (const card of children.get(parent) ?? []) {
      out.push({ card, depth });
      walk(card.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Ids of `id` and everything below it — none of these can be its parent. */
export function selfAndDescendants(cards: TreeCard[], id: number): Set<number> {
  const result = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of cards) {
      if (
        c.parent_id !== null &&
        result.has(c.parent_id) &&
        !result.has(c.id)
      ) {
        result.add(c.id);
        grew = true;
      }
    }
  }
  return result;
}
