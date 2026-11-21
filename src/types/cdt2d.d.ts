declare module 'cdt2d' {
  /**
   * Constrained Delaunay triangulation. Input must be a valid planar straight-line
   * graph: no duplicate points, no crossing edges, no points on edges.
   * `exterior: false` drops faces outside the constraint loops.
   */
  export default function cdt2d(
    points: [number, number][],
    edges?: [number, number][],
    options?: { delaunay?: boolean; interior?: boolean; exterior?: boolean; infinity?: boolean },
  ): [number, number, number][]
}
