import { describe, expect, it, vi } from "vitest";
import { MemoryDataStore } from "./memory-store";

interface TestDoc {
  id: string;
  name: string;
  age: number;
  active: boolean;
}

function makeStore() {
  return new MemoryDataStore();
}

describe("MemoryDataStore", () => {
  describe("collection CRUD", () => {
    it("inserts and finds a document by id", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");
      await col.insert({ id: "1", name: "Alice", age: 30, active: true });

      const doc = await col.findOne("1");
      expect(doc).toEqual({ id: "1", name: "Alice", age: 30, active: true });
    });

    it("returns undefined for missing document", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");
      expect(await col.findOne("nope")).toBeUndefined();
    });

    it("findMany with empty query returns all docs", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");
      await col.insert({ id: "1", name: "Alice", age: 30, active: true });
      await col.insert({ id: "2", name: "Bob", age: 25, active: false });

      const docs = await col.findMany({});
      expect(docs).toHaveLength(2);
    });

    it("findMany with selector filters docs", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");
      await col.insert({ id: "1", name: "Alice", age: 30, active: true });
      await col.insert({ id: "2", name: "Bob", age: 25, active: false });
      await col.insert({ id: "3", name: "Carol", age: 30, active: true });

      const docs = await col.findMany({ selector: { age: 30 } });
      expect(docs).toHaveLength(2);
      expect(docs.map((d) => d.name).sort()).toEqual(["Alice", "Carol"]);
    });

    it("findMany with sort orders results", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");
      await col.insert({ id: "1", name: "Carol", age: 30, active: true });
      await col.insert({ id: "2", name: "Alice", age: 25, active: true });
      await col.insert({ id: "3", name: "Bob", age: 35, active: true });

      const asc = await col.findMany({ sort: [{ field: "age", direction: "asc" }] });
      expect(asc.map((d) => d.name)).toEqual(["Alice", "Carol", "Bob"]);

      const desc = await col.findMany({ sort: [{ field: "age", direction: "desc" }] });
      expect(desc.map((d) => d.name)).toEqual(["Bob", "Carol", "Alice"]);
    });

    it("findMany with limit caps results", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");
      await col.insert({ id: "1", name: "A", age: 1, active: true });
      await col.insert({ id: "2", name: "B", age: 2, active: true });
      await col.insert({ id: "3", name: "C", age: 3, active: true });

      const docs = await col.findMany({
        sort: [{ field: "age", direction: "asc" }],
        limit: 2,
      });
      expect(docs).toHaveLength(2);
      expect(docs.map((d) => d.name)).toEqual(["A", "B"]);
    });

    it("updates a document", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");
      await col.insert({ id: "1", name: "Alice", age: 30, active: true });

      const updated = await col.update("1", { age: 31 });
      expect(updated.age).toBe(31);
      expect(updated.name).toBe("Alice");
      expect(updated.id).toBe("1");

      const fetched = await col.findOne("1");
      expect(fetched?.age).toBe(31);
    });

    it("update throws for missing document", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");
      await expect(col.update("nope", { age: 1 })).rejects.toThrow('Document "nope" not found');
    });

    it("update never overwrites id", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");
      await col.insert({ id: "1", name: "Alice", age: 30, active: true });

      const updated = await col.update("1", { id: "HACKED" } as Partial<TestDoc>);
      expect(updated.id).toBe("1");
    });

    it("removes a document", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");
      await col.insert({ id: "1", name: "Alice", age: 30, active: true });

      await col.remove("1");
      expect(await col.findOne("1")).toBeUndefined();
      expect(await col.findMany({})).toHaveLength(0);
    });

    it("insert throws without id", async () => {
      const store = makeStore();
      const col = store.collection<{ name: string }>("bad");
      await expect(col.insert({ name: "no-id" })).rejects.toThrow("id");
    });
  });

  describe("observe", () => {
    it("emits current state immediately on subscribe", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");
      await col.insert({ id: "1", name: "Alice", age: 30, active: true });

      const callback = vi.fn();
      col.observe({}).subscribe(callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([{ id: "1", name: "Alice", age: 30, active: true }]);
    });

    it("emits on insert", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");
      const callback = vi.fn();
      col.observe({}).subscribe(callback);

      await col.insert({ id: "1", name: "Alice", age: 30, active: true });

      // Initial empty + after insert
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith([
        { id: "1", name: "Alice", age: 30, active: true },
      ]);
    });

    it("emits on update", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");
      await col.insert({ id: "1", name: "Alice", age: 30, active: true });

      const callback = vi.fn();
      col.observe({}).subscribe(callback);

      await col.update("1", { age: 31 });

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith([
        { id: "1", name: "Alice", age: 31, active: true },
      ]);
    });

    it("emits on remove", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");
      await col.insert({ id: "1", name: "Alice", age: 30, active: true });

      const callback = vi.fn();
      col.observe({}).subscribe(callback);

      await col.remove("1");

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith([]);
    });

    it("respects query selector in observations", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");

      const callback = vi.fn();
      col.observe({ selector: { active: true } }).subscribe(callback);

      await col.insert({ id: "1", name: "Alice", age: 30, active: true });
      await col.insert({ id: "2", name: "Bob", age: 25, active: false });

      // Initial empty, after Alice (matches), after Bob (doesn't match — but still emits)
      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenLastCalledWith([
        { id: "1", name: "Alice", age: 30, active: true },
      ]);
    });

    it("unsubscribe stops emissions", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");

      const callback = vi.fn();
      const unsub = col.observe({}).subscribe(callback);

      await col.insert({ id: "1", name: "Alice", age: 30, active: true });
      unsub();
      await col.insert({ id: "2", name: "Bob", age: 25, active: false });

      // Initial + insert, then stopped
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe("settings", () => {
    it("returns undefined for unset key", async () => {
      const store = makeStore();
      expect(await store.getSetting("nope")).toBeUndefined();
    });

    it("stores and retrieves values", async () => {
      const store = makeStore();
      await store.setSetting("theme", "dark");
      expect(await store.getSetting("theme")).toBe("dark");
    });

    it("stores complex values", async () => {
      const store = makeStore();
      await store.setSetting("config", { a: 1, b: [2, 3] });
      expect(await store.getSetting("config")).toEqual({ a: 1, b: [2, 3] });
    });
  });

  describe("lifecycle", () => {
    it("returns same collection instance for same name", () => {
      const store = makeStore();
      const a = store.collection("test");
      const b = store.collection("test");
      expect(a).toBe(b);
    });

    it("destroy clears all state", async () => {
      const store = makeStore();
      const col = store.collection<TestDoc>("users");
      await col.insert({ id: "1", name: "Alice", age: 30, active: true });
      await store.setSetting("key", "val");

      await store.destroy();

      // After destroy, new collection is empty
      const col2 = store.collection<TestDoc>("users");
      expect(await col2.findMany({})).toHaveLength(0);
      expect(await store.getSetting("key")).toBeUndefined();
    });
  });
});
