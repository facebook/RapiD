import * as PIXI from 'pixi.js';
import { osmPavedTags } from '../osm/tags';
import { COLORS } from './colors.js';
//
// A "style" is a bundle of properties to say how things should look.
// Each "style" looks like this:
//
// stylename: {
//   fill:   { props },
//   casing: { props },
//   stroke: { props }
// }
//
// Available property groups:
//   `fill`   - properties used when drawing feature as a filled area
//   `casing` - properties used when drawing feature as a line (casing draws below stroke)
//   `stroke` - properties used when drawing feature as a line
//
// Available properties:
//   `width` - line width in pixel (for fills, this is the width of the outline)
//   `color` - the color
//   `alpha` - 0 = transparent/invisible, 1 = filled
//   `cap`   - `PIXI.LINE_CAP.` `BUTT`, `SQUARE`, or `ROUND`
//   `join`  - `PIXI.LINE_JOIN.` `BEVEL`, `MITER`, or `ROUND`
//   `dash`  - array of pixels on/off - e.g. `[20, 5, 5, 5]`
//
// The fill group also supports:
//   `pattern` - supported pattern (see dist/img/pattern/* for these)
//
// Anything missing will just be pulled from the DEFAULT style.
//

export const STYLES = {
  DEFAULT: {
    fill:   { width: 2, color: COLORS.fill, alpha: 0.3 },
    casing: { width: 5, color: COLORS.casing, alpha: 1, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND },
    stroke: { width: 3, color: COLORS.stroke, alpha: 1, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND }
  },

  red: {
    fill: { color: COLORS.red, alpha: 0.3 }
  },
  green: {
    fill: { color: COLORS.green, alpha: 0.3 }
  },
  blue: {
    fill: { color: COLORS.blue, alpha: 0.3 }
  },
  yellow: {
    fill: { color: COLORS.yellow, alpha: 0.25 }
  },
  gold: {
    fill: { color: COLORS.gold, alpha: 0.3 }
  },
  orange: {
    fill: { color: COLORS.orange, alpha: 0.3 }
  },
  pink: {
    fill: { color: COLORS.pink, alpha: 0.3 }
  },
  teal: {
    fill: { color: COLORS.teal, alpha: 0.3 }
  },
  lightgreen: {
    fill: { color: COLORS.lightgreen, alpha: 0.3 }
  },
  tan: {
    fill: { color: COLORS.tan, alpha: 0.3 }
  },
  darkgray: {
    fill: { color: COLORS.darkgray, alpha: 0.5 }
  },
  lightgray: {
    fill: { color: COLORS.lightgray, alpha: 0.3 }
  },

  motorway: {
    casing: { width: 10, color: COLORS.motorway.casing },
    stroke: { width: 8, color: COLORS.motorway.stroke}
  },
  trunk: {
    casing: { width: 10, color: COLORS.trunk.casing },
    stroke: { width: 8, color: COLORS.stroke.stroke }
  },
  primary: {
    casing: { width: 10, color: COLORS.primary.casing },
    stroke: { width: 8, color: COLORS.primary.stroke }
  },
  secondary: {
    casing: { width: 10, color: COLORS.secondary.casing },
    stroke: { width: 8, color: COLORS.secondary.stroke }
  },
  tertiary: {
    casing: { width: 10, color: COLORS.tertiary.casing },
    stroke: { width: 8, color: COLORS.tertiary.stroke }
  },
  unclassified: {
    casing: { width: 10, color: COLORS.unclassified.casing },
    stroke: { width: 8, color: COLORS.unclassified.stroke }
  },
  residential: {
    casing: { width: 10, color: COLORS.residential.casing },
    stroke: { width: 8, color: COLORS.residential.stroke}
  },
  living_street: {
    casing: { width: 7, color: COLORS.living_street.casing },
    stroke: { width: 5, color: COLORS.living_street.stroke }
  },
  service: {
    casing: { width: 7, color: COLORS.service.casing },
    stroke: { width: 5, color: COLORS.service.stroke }
  },
  special_service: {
    casing: { width: 7, color: COLORS.special_service.casing },
    stroke: { width: 5, color: COLORS.special_service.stroke }
  },
  track: {
    casing: { width: 7, color: COLORS.track.casing },
    stroke: { width: 5, color: COLORS.track.stroke }
  },

  pedestrian: {
    casing: { width: 7, color: COLORS.pedestrian.casing },
    stroke: { width: 5, color: COLORS.pedestrian.stroke, dash: [8, 8], cap: PIXI.LINE_CAP.BUTT }
  },
  path: {
    casing: { width: 5, color: COLORS.path.casing },
    stroke: { width: 3, color: COLORS.path.stroke, dash: [6, 6], cap: PIXI.LINE_CAP.BUTT }
  },
  footway: {
    casing: { width: 5, color: COLORS.footway.casing },
    stroke: { width: 3, color: COLORS.footway.stroke, dash: [6, 6], cap: PIXI.LINE_CAP.BUTT }
  },
  crossing_marked: {
    casing: { width: 5, color: COLORS.crossing_marked.casing},
    stroke: { width: 3, color: COLORS.crossing_marked.stroke, dash: [6, 3], cap: PIXI.LINE_CAP.BUTT }
  },
  crossing_unmarked: {
    casing: { width: 5, color: COLORS.crossing_unmarked.casing },
    stroke: { width: 3, color: COLORS.crossing_unmarked.stroke, dash: [6, 4], cap: PIXI.LINE_CAP.BUTT }
  },
  cycleway: {
    casing: { width: 5, color: COLORS.cycleway.casing },
    stroke: { width: 3, color: COLORS.cycleway.stroke, dash: [6, 6], cap: PIXI.LINE_CAP.BUTT }
  },
  bridleway: {
    casing: { width: 5, color: COLORS.bridleway.casing },
    stroke: { width: 3, color: COLORS.bridleway.stroke, dash: [6, 6], cap: PIXI.LINE_CAP.BUTT }
  },
  corridor: {
    casing: { width: 5, color: COLORS.corridor.casing },
    stroke: { width: 3, color: COLORS.corridor.stroke, dash: [2, 8], cap: PIXI.LINE_CAP.ROUND }
  },
  steps: {
    casing: { width: 5, color: COLORS.steps.casing },
    stroke: { width: 3, color: COLORS.steps.stroke, dash: [3, 3], cap: PIXI.LINE_CAP.BUTT }
  },

  river: {
    casing: { width: 10, color: COLORS.river.casing },
    stroke: { width: 8, color: COLORS.river.stroke }
  },
  stream: {
    casing: { width: 7, color: COLORS.stream.casing },
    stroke: { width: 5, color: COLORS.stream.stroke }
  },
  ridge: {
    stroke: { width: 2, color: COLORS.ridge.stroke}
  },

  runway: {
    casing: { width: 10, color: COLORS.runway.casing , cap: PIXI.LINE_CAP.BUTT},
    stroke: { width: 8, color: COLORS.runway.stroke, dash: [24, 48], cap: PIXI.LINE_CAP.BUTT }
  },
  taxiway: {
    casing: { width: 7, color: COLORS.taxiway.casing },
    stroke: { width: 5, color: COLORS.taxiway.stroke }
  },

  railway: {
    casing: { width: 7, color: COLORS.railway.casing, cap: PIXI.LINE_CAP.BUTT },
    stroke: { width: 2, color: COLORS.railway.stroke, dash: [12, 12], cap: PIXI.LINE_CAP.BUTT,  }
  },

  ferry: {
    casing: { alpha: 0 },  // disable
    stroke: { width: 3, color: COLORS.ferry.stroke, dash: [12, 8], cap: PIXI.LINE_CAP.BUTT }
  },

  boundary: {
    casing: { width: 6, color: COLORS.boundary.casing, cap: PIXI.LINE_CAP.BUTT },
    stroke: { width: 2, color: COLORS.boundary.stroke, dash: [20, 5, 5, 5], cap: PIXI.LINE_CAP.BUTT }
  },
  boundary_park: {
    casing: { width: 6, color: COLORS.boundary_park.casing, cap: PIXI.LINE_CAP.BUTT },
    stroke: { width: 2, color: COLORS.boundary_park.stroke, dash: [20, 5, 5, 5], cap: PIXI.LINE_CAP.BUTT }
  },

  barrier: {
    casing: { alpha: 0 },  // disable
    stroke: { width: 3, color: COLORS.barrier.stroke, dash: [10, 5, 1, 5], cap: PIXI.LINE_CAP.ROUND }
  },
  barrier_wall: {
    casing: { alpha: 0 },  // disable
    stroke: { width: 3, color: COLORS.barrier_wall.stroke, dash: [10, 5, 1, 5], cap: PIXI.LINE_CAP.ROUND }
  },
  barrier_hedge: {
    fill:   { color: COLORS.barrier_hedge.fill, alpha: 0.3 },
    casing: { alpha: 0 },  // disable
    stroke: { width: 3, color: COLORS.barrier_hedge.stroke, dash: [10, 5, 1, 5], cap: PIXI.LINE_CAP.ROUND }
  },

  tree_row: {
    casing: { width: 7, color: COLORS.tree_row.casing },
    stroke: { width: 5, color: COLORS.tree_row.stroke }
  }
};


//
// A "style selector" contains OSM key/value tags to match to a style.
// Each "style selector" looks like this:
//
// osmkey: {
//   osmvalue: stylename
// }
//
// Can use the value '*' to match any osmvalue.
//
// Important: The fewer rules in the selector, the more selective it is.
// For example:
//   The `amenity` selector has 8 rules in it
//   The `building` selector has 1 rule in it
//
// So a feature with both `amenity=kindergarden` and `building=yes` tags
// will be styled with the `building` rule.
//

const STYLE_SELECTORS = {
  aeroway: {
    runway: 'runway',
    taxiway: 'taxiway'
  },
  amenity: {
    childcare: 'yellow',
    college: 'yellow',
    fountain: 'blue',
    kindergarten: 'yellow',
    parking: 'darkgray',
    research_institute: 'yellow',
    school: 'yellow',
    university: 'yellow'
  },
  building: {
    '*': 'red'
  },
  barrier: {
    city_wall: 'barrier_wall',
    hedge: 'barrier_hedge',
    retaining_wall: 'barrier_wall',
    wall: 'barrier_wall',
    '*': 'barrier'
  },
  boundary: {
    protected_area: 'boundary_park',
    national_park: 'boundary_park',
    '*': 'boundary'
  },
  crossing: {
    marked: 'crossing_marked',
    traffic_signals: 'crossing_marked',
    uncontrolled: 'crossing_marked',
    zebra: 'crossing_marked',
    '*': 'crossing_unmarked'
  },
  golf: {
    green: 'lightgreen'
  },
  highway: {
    bridleway: 'bridleway',
    bus_guideway: 'railway',
    busway: 'special_service',
    corridor: 'corridor',
    cycleway: 'cycleway',
    footway: 'footway',
    living_street: 'living_street',
    living_street_link: 'living_street',
    motorway: 'motorway',
    motorway_link: 'motorway',
    path: 'path',
    pedestrian: 'pedestrian',
    primary: 'primary',
    primary_link: 'primary',
    residential: 'residential',
    residential_link: 'residential',
    secondary: 'secondary',
    secondary_link: 'secondary',
    service: 'service',
    service_link: 'service',
    steps: 'steps',
    tertiary: 'tertiary',
    tertiary_link: 'tertiary',
    track: 'track',
    trunk: 'trunk',
    trunk_link: 'trunk',
    unclassified: 'unclassified',
    unclassified_link: 'unclassified'
  },
  landuse: {
    cemetery: 'lightgreen',
    commercial: 'orange',
    construction: 'gold',
    farmland: 'lightgreen',
    farmyard: 'tan',
    flowerbed: 'green',
    forest: 'green',
    grass: 'green',
    industrial: 'pink',
    landfill: 'orange',
    meadow: 'lightgreen',
    military: 'orange',
    orchard: 'lightgreen',
    quarry: 'darkgray',
    railway: 'darkgray',
    recreation_ground: 'green',
    residential: 'gold',
    retail: 'orange',
    village_green: 'green',
    vineyard: 'lightgreen'
  },
  leisure: {
    garden: 'green',
    golf_course: 'green',
    nature_reserve: 'green',
    park: 'green',
    pitch: 'green',
    swimming_pool: 'blue',
    track: 'yellow'
  },
  man_made: {
    adit: 'darkgray',
    breakwater: 'barrier_wall',
    groyne: 'barrier_wall'
  },
  military: {
    '*': 'orange'
  },
  natural: {
    bare_rock: 'darkgray',
    bay: 'blue',
    beach: 'yellow',
    cave_entrance: 'darkgray',
    cliff: 'darkgray',
    glacier: 'lightgray',
    ridge: 'ridge',
    rock: 'darkgray',
    sand: 'yellow',
    scree: 'darkgray',
    scrub: 'yellow',
    shingle: 'darkgray',
    stone: 'darkgray',
    tree_row: 'tree_row',
    water: 'blue',
    wetland: 'teal',
    '*': 'green'
  },
  power: {
    'plant': 'pink'
  },
  railway: {
    platform: 'footway',
    '*': 'railway'
  },
  route: {
    'ferry': 'ferry'
  },
  sport: {
    baseball: 'yellow',
    basketball: 'darkgray',
    beachvolleyball: 'yellow',
    skateboard: 'darkgray',
    softball: 'yellow'
  },
  type: {
    waterway: 'river'
  },
  waterway: {
    river: 'river',
    dam: 'DEFAULT',
    weir: 'DEFAULT',
    '*': 'stream'
  },
  service: {
    alley: 'special_service',
    driveway: 'special_service',
    'drive-through': 'special_service',
    parking_aisle: 'special_service',
    '*': 'special_service'
  }
};


//
// "pattern selectors" work exactly like style selectors.
// They contain OSM key/value tags to match to a pattern.
//
// osmkey: {
//   osmvalue: patternname
// }
//

const PATTERN_SELECTORS = {
  amenity: {
    fountain: 'water_standing',
    grave_yard: 'cemetery'
  },
  golf: {
    green: 'grass'
  },
  landuse: {
    cemetery: 'cemetery',
    construction: 'construction',
    farmland: 'farmland',
    farmyard: 'farmyard',
    forest: 'forest',
    grass: 'grass',
    grave_yard: 'cemetery',
    landfill: 'landfill',
    meadow: 'grass',
    military: 'construction',
    orchard: 'orchard',
    quarry: 'quarry',
    vineyard: 'vineyard'
  },
  leaf_type: {
    broadleaved: 'forest_broadleaved',
    leafless: 'forest_leafless',
    needleleaved: 'forest_needleleaved'
  },
  natural: {
    beach: 'dots',
    grassland: 'grass',
    sand: 'dots',
    scrub: 'bushes',
    water: 'waves',
    wetland: 'wetland',
    wood: 'forest'
  },
  religion: {
    buddhist: 'cemetery_buddhist',
    christian: 'cemetery_christian',
    jewish: 'cemetery_jewish',
    muslim: 'cemetery_muslim'
  },
  surface: {
    grass: 'grass'
  },
  water: {
    pond: 'pond',
    reservoir: 'lines'
  },
  wetland: {
    bog: 'wetland_bog',
    marsh: 'wetland_marsh',
    reedbed: 'wetland_reedbed',
    swamp: 'wetland_swamp'
  },
};


const ROADS = {
  motorway: true,
  motorway_link: true,
  trunk: true,
  trunk_link: true,
  primary: true,
  primary_link: true,
  secondary: true,
  secondary_link: true,
  tertiary: true,
  tertiary_link: true,
  unclassified: true,
  unclassified_link: true,
  residential: true,
  residential_link: true,
  living_street: true,
  living_street_link: true,
  service: true,
  service_link: true,
  bus_guideway: true,
  track: true
};


export function styleMatch(tags) {
  let matched = STYLES.DEFAULT;
  let selectivity = 999;

  for (const [k, v] of Object.entries(tags)) {
    const group = STYLE_SELECTORS[k];
    if (!group || !v) continue;

    // smaller groups are more selective
    const groupsize = Object.keys(group).length;
    const stylename = group[v] || group['*'];  // fallback value

    if (stylename && groupsize <= selectivity) {
      if (!STYLES[stylename]) {
        console.error(`invalid stylename: ${stylename}`);  // eslint-disable-line
        continue;
      }
      matched = STYLES[stylename];
      selectivity = groupsize;
      if (selectivity === 1) break;  // no need to keep looking at tags
    }
  }

  // copy style, filling in defaults
  let style = {};
  for (const group of ['fill', 'casing', 'stroke']) {
    style[group] = {};
    for (const prop of ['width', 'color', 'alpha', 'cap', 'dash']) {
      let value = matched[group] && matched[group][prop];
      if (value !== undefined) {
        style[group][prop] = value;
        continue;
      }
      let fallback = STYLES.DEFAULT[group] && STYLES.DEFAULT[group][prop];
      if (fallback !== undefined) {
        style[group][prop] = fallback;
      }
    }
  }

  // Apply casing/stroke overrides
  const bridge = getTag(tags, 'bridge');
  const building = getTag(tags, 'building');
  const cutting = getTag(tags, 'cutting');
  const embankment = getTag(tags, 'embankment');
  const highway = getTag(tags, 'highway');
  const tracktype = getTag(tags, 'tracktype');
  const tunnel = getTag(tags, 'tunnel');
  let surface = getTag(tags, 'surface');
  if (highway === 'track' && tracktype !== 'grade1') {
    surface = surface || 'dirt';   // default unimproved (non-grade1) tracks to 'dirt' surface
  }

  if (bridge || embankment || cutting) {
    style.casing.width += 7;
    style.casing.color = 0x000000;
    style.casing.cap = PIXI.LINE_CAP.BUTT;
    if (embankment || cutting) {
      style.casing.dash = [2, 4];
    }
  }
  if (tunnel) {
    style.stroke.alpha = 0.5;
  }

  if (surface && ROADS[highway] && !osmPavedTags.surface[surface]) {
    if (!bridge) style.casing.color = 0xcccccc;
    style.casing.cap = PIXI.LINE_CAP.BUTT;
    style.casing.dash = [4, 4];
  }

  // Look for fill pattern
  if (style.fill.pattern) return style;   // already has a pattern defined by the style
  if (building) return style;             // don't apply patterns to buildings

  // Otherwise, look for a matching fill pattern.
  selectivity = 999;
  for (const k in tags) {
    const v = tags[k];
    const group = PATTERN_SELECTORS[k];
    if (!group || !v) continue;

    // smaller groups are more selective
    let groupsize = Object.keys(group).length;
    let patternname = group[v];
    if (!patternname) patternname = group['*'];  // fallback value

    if (patternname && groupsize <= selectivity) {
      style.fill.pattern = patternname;
      selectivity = groupsize;
      if (selectivity === 1) break;  // no need to keep looking at tags
    }
  }

  return style;


  // This just returns the value of the tag, but ignores 'no' values
  function getTag(tags, key) {
    return tags[key] === 'no' ? undefined : tags[key];
  }

}
