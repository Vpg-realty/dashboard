// BrandTile / MoneyTile are the old names of the site's number tile (Oct
// 19–22). Since Luke's Oct 22 round every number tile is `Tile`
// (src/shell/Tile.jsx — the approved Deals › Active tile); this keeps the old
// props working (`accent` = the dot, `mark` is no longer drawn).
import { Tile } from './Tile.jsx';

export function BrandTile({ accent = 'navy', mark, ...props }) {
  void mark;
  return <Tile dot={accent} {...props} />;
}
