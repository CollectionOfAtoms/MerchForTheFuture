import { describe, it, expect } from "vitest";
import { sortByUsLandedCost } from "@/lib/admin/teemill-catalog";

// US-MFTF-19.6 — the admin catalog view can sort referenced products by US-landed
// cost (cheapest-first scan). Unrecorded (null) costs always sort last so they
// never masquerade as cheap.

const rows = [
  { id: "a", usLandedCost: 2500 },
  { id: "b", usLandedCost: null },
  { id: "c", usLandedCost: 1000 },
  { id: "d", usLandedCost: 1800 },
];

describe("sortByUsLandedCost", () => {
  it("sorts ascending with nulls last", () => {
    expect(sortByUsLandedCost(rows, "asc").map((r) => r.id)).toEqual(["c", "d", "a", "b"]);
  });

  it("sorts descending with nulls last", () => {
    expect(sortByUsLandedCost(rows, "desc").map((r) => r.id)).toEqual(["a", "d", "c", "b"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...rows];
    sortByUsLandedCost(rows, "asc");
    expect(rows).toEqual(copy);
  });
});
