import { describe, expect, it } from "vitest";
import { beforeTdd } from "./before-tdd";
import { kvex } from "./index";

beforeTdd();
const table = "kvex-example3";

describe.concurrent("kvex", () => {
  kvex.config.clearInterval = 200;
  it("set and get", async () => {
    {
      await kvex.setEx(table, "v1", 300, "the dog");
      const data = await kvex.get(table, "v1");
      expect(data).eq("the dog");
    }
    {
      await new Promise((r) => setTimeout(r, 10));
      const data = await kvex.get(table, "v1");
      expect(data).eq("the dog");
    }
    {
      await new Promise((r) => setTimeout(r, 500));
      const data = await kvex.get(table, "v1");
      expect(data).eq(null);
    }
    {
      await kvex.setOnceEx(table, "once-test", 1000, "b");
      await kvex.setOnceEx(table, "once-test", 1000, "ccc");
      const v = await kvex.get(table, "once-test");
      expect(v).eq("b");
    }
  });
});
