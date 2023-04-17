import { describe, expect, it } from "vitest";
import { kv } from ".";
import { beforeTdd } from "./before-tdd";

beforeTdd();
const table = "kv-example";

describe.concurrent("kv", () => {
  it("set and get", async () => {
    {
      await kv.set(table, "v1", "the dog");
      const data = await kv.get(table, "v1");
      expect(data).eq("the dog");
    }
    {
      await new Promise((r) => setTimeout(r, 10));
      const data = await kv.get(table, "v1");
      expect(data).eq("the dog");
    }
    {
      await kv.setOnce(table, "once-test", "apple");
      await kv.setOnce(table, "once-test", "ccc");
      const v = await kv.get(table, "once-test");
      expect(v).eq("apple");
    }
  });
});
