import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { vi } from "vite-plus/test";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as CircuitFiles from "./CircuitFiles.ts";
import * as CircuitFilePicker from "./CircuitFilePickerLegacy.ts";

const { showSaveDialog } = vi.hoisted(() => ({ showSaveDialog: vi.fn() }));
vi.mock("electron", () => ({ dialog: { showSaveDialog } }));

const windows = Layer.succeed(
  ElectronWindow.ElectronWindow,
  ElectronWindow.ElectronWindow.of({
    create: () => Effect.die("unexpected window creation"),
    main: Effect.succeedNone,
    currentMainOrFirst: Effect.succeedNone,
    focusedMainOrFirst: Effect.succeedNone,
    setMain: () => Effect.void,
    clearMain: () => Effect.void,
    prepareReveal: () => Effect.succeed(false),
    reveal: () => Effect.void,
    sendAll: () => Effect.void,
    destroyAll: Effect.void,
    syncAllAppearance: () => Effect.void,
  }),
);
const dialogs = (selected: string[]) =>
  Layer.succeed(
    ElectronDialog.ElectronDialog,
    ElectronDialog.ElectronDialog.of({
      pickFiles: () => Effect.succeed(selected),
      pickFolder: () => Effect.succeedNone,
      showMessageBox: () => Effect.die("unexpected message box"),
      showErrorBox: () => Effect.void,
    }),
  );

it.effect(
  "only writes to chosen files, preserves cancelled saves, and cleans up atomic-write files",
  () =>
    Effect.gen(function* () {
      showSaveDialog.mockReset();
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped();
      const chosen = `${directory}/board.tsci.json`;
      const unchosen = `${directory}/other.txt`;
      yield* fs.writeFileString(chosen, "original");
      yield* fs.writeFileString(unchosen, "keep");
      yield* Effect.gen(function* () {
        const files = yield* CircuitFiles.CircuitFiles;
        const denied = yield* files
          .save({ name: "board.tsci.json", text: "overwrite", path: unchosen, encoding: "utf8" })
          .pipe(Effect.flip);
        assert.equal(denied.operation, "validate");
        assert.equal(yield* fs.readFileString(unchosen), "keep");
        assert.equal((yield* files.open)?.text, "original");
        yield* files.save({
          name: "board.tsci.json",
          text: "updated circuit",
          path: chosen,
          encoding: "utf8",
        });
        assert.equal(yield* fs.readFileString(chosen), "updated circuit");
        showSaveDialog.mockResolvedValueOnce({ canceled: true });
        assert.equal(
          yield* files.save({ name: "copy.tsci.json", text: "copy", path: null, encoding: "utf8" }),
          null,
        );
        const zipPath = `${directory}/board.zip`;
        showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: zipPath });
        yield* files.save({ name: "board.zip", text: "UEsAAQ==", path: null, encoding: "base64" });
        assert.deepEqual(Array.from(yield* fs.readFile(zipPath)), [80, 75, 0, 1]);
        assert.isFalse(
          (yield* fs.readDirectory(directory)).some((name) => name.startsWith(".tsci-")),
        );
        const invalid = yield* files
          .save({ name: "../outside.json", text: "invalid", path: null, encoding: "utf8" })
          .pipe(Effect.flip);
        assert.equal(invalid.operation, "validate");
      }).pipe(
        Effect.provide(
          CircuitFiles.layer.pipe(
            Layer.provide(
              Layer.merge(
                NodeServices.layer,
                CircuitFilePicker.layer.pipe(
                  Layer.provide(Layer.merge(windows, dialogs([chosen]))),
                ),
              ),
            ),
          ),
        ),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
);
