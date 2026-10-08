import { makeTestRepo } from "./helpers";
import { repoContract } from "./repo.contract";

repoContract("sqlite", async () => makeTestRepo());
