/** Shared pathing vocabulary. Formats decode it; pure simulation consumes it. */
export const WPM_CELL_SIZE = 32;
export const FLAG_NO_WALK = 0x02;
export const FLAG_NO_FLY = 0x04;
export const FLAG_NO_BUILD = 0x08;

export interface PathingMap {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array; // row-major, row 0 = 남(하단). length = width*height
  readonly cellSize: number;
  /** 셀(0,0) *중심*의 월드 좌표(중심 원점 관례). */
  readonly originX: number;
  readonly originY: number;
}


export interface PathingFootprint {readonly width:number;readonly height:number;readonly cells:ReadonlyArray<number>;}
