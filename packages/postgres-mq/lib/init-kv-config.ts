import { kvex } from "postgres-kv";
import { MQ_EX_TABLE, MQ_STATE_TABLE } from "./keys";

kvex.config.tablesInterval[MQ_STATE_TABLE] = 1000;
kvex.setUnlogged(MQ_STATE_TABLE);
kvex.setUnlogged(MQ_EX_TABLE);
