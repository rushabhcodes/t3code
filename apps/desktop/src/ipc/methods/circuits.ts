import {
  CircuitFileSchema,
  CircuitSavedFileSchema,
  CircuitSaveInputSchema,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as CircuitFiles from "../../circuits/CircuitFiles.ts";
import * as DesktopIpc from "../DesktopIpc.ts";
import * as IpcChannels from "../channels.ts";

const open = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.OPEN_CIRCUIT_FILE_CHANNEL,
  payload: Schema.Undefined,
  result: Schema.NullOr(CircuitFileSchema),
  handler: () => Effect.flatMap(CircuitFiles.CircuitFiles, (files) => files.open),
});
const save = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SAVE_CIRCUIT_FILE_CHANNEL,
  payload: CircuitSaveInputSchema,
  result: Schema.NullOr(CircuitSavedFileSchema),
  handler: (input) => Effect.flatMap(CircuitFiles.CircuitFiles, (files) => files.save(input)),
});

export const installCircuitFileHandlers = Effect.fn("tsci.ipc.installCircuitFiles")(function* () {
  const ipc = yield* DesktopIpc.DesktopIpc;
  yield* ipc.handle(open);
  yield* ipc.handle(save);
}, Effect.provide(CircuitFiles.layer));
