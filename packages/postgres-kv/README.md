# postgres-kv

Use postgres do key/value

## kv

```ts
import { kv } from "postrgres-kv";

await kv.set("the_table", "key", 20);
await kv.get("the_table", "key");
await kv.del("the_table", "key");
```

## kvex

```ts
import { kvex } from "postrgres-kv";

await kvex.setEx("the_table", "key", 1000 * 60 * 60, "hello");
await kvex.get("the_table", "key");
await kvex.del("the_table", "key");
```
