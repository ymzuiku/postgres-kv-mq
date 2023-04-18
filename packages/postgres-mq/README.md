# postgres-mq

Use postgres do mq

```ts
import { mq } from "postgres-mq";
mq.Queue("hello", { foo: "bar" });

mq.Worker("hello", (job) => {
  console.log(job.id, job);
});
```
