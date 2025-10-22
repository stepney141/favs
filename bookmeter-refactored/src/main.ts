import { runCli } from "@/interfaces/cli/bookmeterCli";

(async () => {
  const exitCode = await runCli(process.argv);
  process.exit(exitCode);
})();
