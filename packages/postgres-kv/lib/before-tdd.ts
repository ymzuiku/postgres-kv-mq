import { config } from "up-dir-env";
import { beforeAll } from "vitest";
import { pgConnect } from "./connect";

export function beforeTdd() {
  beforeAll(() => {
    config();
    pgConnect();
  });
}
