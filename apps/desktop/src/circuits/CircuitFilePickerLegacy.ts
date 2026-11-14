import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Electron from "electron";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import { CircuitFilePicker, CircuitFilePickerError } from "./CircuitFilePicker.ts";

const make = Effect.gen(function* () {
  const dialog = yield* ElectronDialog.ElectronDialog;
  const windows = yield* ElectronWindow.ElectronWindow;
  return CircuitFilePicker.of({
    open: Effect.gen(function* () {
      const paths = yield* dialog.pickFiles({
        owner: yield* windows.focusedMainOrFirst,
        defaultPath: Option.none(),
        filters: [{ name: "TSCI Code project or circuit", extensions: ["json", "tsx", "jsx"] }],
        multiple: false,
      });
      return Option.fromNullishOr(paths[0]);
    }).pipe(Effect.mapError((cause) => new CircuitFilePickerError({ cause }))),
    save: Effect.fn("tsci.circuitFilePicker.save")(function* (name) {
      const owner = yield* windows.focusedMainOrFirst;
      const options: Electron.SaveDialogOptions = {
        title: "Save from TSCI Code",
        defaultPath: name,
        filters: [{ name: "Circuit file", extensions: [name.split(".").at(-1) ?? "json"] }],
      };
      const result = yield* Effect.tryPromise({
        try: () =>
          Option.isSome(owner)
            ? Electron.dialog.showSaveDialog(owner.value, options)
            : Electron.dialog.showSaveDialog(options),
        catch: (cause) => new CircuitFilePickerError({ cause }),
      });
      return result.canceled ? Option.none() : Option.fromNullishOr(result.filePath);
    }),
  });
});

export const layer = Layer.effect(CircuitFilePicker, make);
