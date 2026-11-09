type Check = { id: string; label: string; pass: (source: string) => boolean; passDetail: string; reviseDetail: string };
const check = (id: string, label: string, patterns: RegExp[], detail: string): Check => ({
  id, label, pass: source => patterns.every(pattern => pattern.test(source)),
  passDetail: detail, reviseDetail: detail,
});

export const classDesignReasoningChecks: Record<string, Check[]> = {
  'lru-cache-v1': [
    check('state', 'Lookup and recency state', [/map|dictionary/i, /doubly linked|ordered map|ordered dictionary/i], 'Keep a map and a recency ordering that support constant-time moves.'),
    check('get', 'Successful reads refresh recency', [/get/i, /missing.*-1|-1.*missing/i, /move.*most recent/i], 'A missing get returns -1; a hit moves its entry to most recent.'),
    check('update', 'Updates preserve one entry per key', [/existing key/i, /update.*value/i, /move.*most recent/i], 'Update an existing key’s value and refresh its recency without adding a duplicate.'),
    check('evict', 'Capacity and coherent eviction', [/capacity/i, /evict.*least recent/i, /remove.*map/i, /unlink|remove.*list/i], 'When capacity is exceeded, evict the least recent entry from both map and list.'),
  ],
  'session-manager-v1': [
    check('state', 'Expiry map and boundary', [/map|dictionary/i, /expiry/i, /greater than time|expiry\s*>\s*time/i, /equal.*expired/i], 'Store expiry per id; expiry must be greater than time to be live, so equality is expired.'),
    check('create', 'Creation overwrites the deadline', [/create/i, /overwrite|replace/i, /time.*plus.*ttl|time\s*\+\s*ttl/i], 'Create replaces that id’s expiry with time plus ttl.'),
    check('renew', 'Renewal checks live state first', [/renew/i, /check.*live.*before|only.*live/i, /otherwise return false|return false.*expired/i], 'Renew only a currently live id; failed renewals return false and cannot revive it.'),
    check('revoke', 'Revocation result', [/revoke/i, /delete.*live/i, /return true/i, /return false/i], 'Revoke deletes a live id and returns true, otherwise false.'),
    check('count', 'Count live entries', [/count/i, /scan|iterate|each/i, /only.*expiry greater than time|live entries|live sessions/i], 'Count only live entries; expired labels must not contribute.'),
  ],
  'order-book-v1': [
    check('state', 'Independent side state', [/separate|independent/i, /buy/i, /sell/i, /map/i], 'Keep separate maps for buy and sell price levels.'),
    check('add', 'Aggregate at one price level', [/add/i, /increase|aggregate/i, /price/i, /quantity/i], 'Add accumulates quantity at the selected side and price.'),
    check('cancel', 'Bounded cancellation and cleanup', [/cancel/i, /minimum|min\(/i, /available|volume/i, /return.*removed/i, /delete.*zero/i], 'Cancel returns the minimum of requested and available volume; delete zero levels.'),
    check('best', 'Opposite best-price directions', [/maximum buy|max.*buy/i, /minimum sell|min.*sell/i, /-1/i, /empty/i], 'Best uses maximum buy price and minimum sell price, or -1 when empty.'),
    check('volume', 'Missing level result', [/volume/i, /zero.*missing|0.*missing|missing.*zero|missing.*0/i], 'Volume returns zero for a missing price level.'),
  ],
};

export const classDesignCriticalMistakes: Record<string, RegExp[]> = {
  'lru-cache-v1': [/evict.*inserted first/i, /get.*without changing.*order/i],
  'session-manager-v1': [/live when.*expiry equals/i, /renew any.*absent/i, /count every id ever/i],
  'order-book-v1': [/one map for both/i, /cancel the requested quantity even/i, /smallest price.*both sides/i],
};
