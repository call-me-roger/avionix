import {
  type BasemapFile,
  type MapData,
  type RunwayFile,
  createMapData,
} from '@/domain/map/map-data';

let loaded: MapData | null = null;

/**
 * The committed snapshot (`assets/map/`), required on first use so it costs nothing on native
 * until the Map panel is opened (the web bundle inlines it; only evaluation waits), and kept out
 * of the TypeScript program (a 1 MB literal type is slow).
 */
export function bundledMapData(): MapData {
  if (loaded === null) {
    const basemap = require('../../../assets/map/basemap.json') as BasemapFile;
    const runways = require('../../../assets/map/runways.json') as RunwayFile;
    loaded = createMapData(basemap, runways);
  }
  return loaded;
}
