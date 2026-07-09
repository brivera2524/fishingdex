// leaflet-velocity ships no types of its own — this covers only the surface
// this app actually uses (L.velocityLayer + the layer's setData/remove),
// not the library's full option set.
import "leaflet";

declare module "leaflet" {
  interface VelocityLayerHeader {
    parameterCategory: number;
    parameterNumber: number;
    parameterUnit?: string;
    nx: number;
    ny: number;
    lo1: number;
    la1: number;
    lo2: number;
    la2: number;
    dx: number;
    dy: number;
    refTime?: string;
    forecastTime?: number;
  }

  interface VelocityLayerRecord {
    header: VelocityLayerHeader;
    data: number[];
  }

  interface VelocityLayerOptions {
    displayValues?: boolean;
    displayOptions?: {
      velocityType?: string;
      position?: string;
      speedUnit?: string;
      angleConvention?: string;
    };
    data: VelocityLayerRecord[];
    minVelocity?: number;
    maxVelocity?: number;
    velocityScale?: number;
    colorScale?: string[];
    opacity?: number;
    frameRate?: number;
    particleAge?: number;
    particleMultiplier?: number;
  }

  interface VelocityLayer extends Layer {
    setData(data: VelocityLayerRecord[]): void;
  }

  function velocityLayer(options: VelocityLayerOptions): VelocityLayer;
}
