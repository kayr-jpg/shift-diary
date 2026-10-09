import { createD1Repo } from "../src/repo.d1";
import { useD1 } from "./d1";
import { repoContract } from "./repo.contract";

const d1 = useD1();

repoContract("d1", async () => createD1Repo(await d1.fresh()));
