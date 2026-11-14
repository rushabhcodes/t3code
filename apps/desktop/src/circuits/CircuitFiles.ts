import type {
  CircuitFileSchema,
  CircuitSavedFileSchema,
  CircuitSaveInputSchema,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as CircuitFilePicker from "./CircuitFilePicker.ts";

export class CircuitFileError extends Schema.TaggedError<CircuitFileError>()("CircuitFileError", {
  operation: Schema.Literals(["open", "save", "validate"]),
  cause: Schema.Defect(),
}) {
  override get message() {
    return `Couldn’t ${this.operation} the circuit file. Check its size, location, and file permissions, then try again.`;
  }
}

export class CircuitFiles extends Context.Service<
  CircuitFiles,
  {
    readonly open: Effect.Effect<typeof CircuitFileSchema.Type | null, CircuitFileError>;
    readonly save: (
      input: typeof CircuitSaveInputSchema.Type,
    ) => Effect.Effect<typeof CircuitSavedFileSchema.Type | null, CircuitFileError>;
  }
>()("@t3tools/desktop/circuits/CircuitFiles") {}

const isCircuitFileError = Schema.is(CircuitFileError);

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const picker = yield* CircuitFilePicker.CircuitFilePicker;
  const grantedPaths = new Set<string>();

  const open = Effect.gen(function* () {
    const selection = yield* picker.open;
    if (Option.isNone(selection)) return null;
    const selected = selection.value;
    if (Number((yield* fs.stat(selected)).size) > 2 * 1024 * 1024)
      return yield* new CircuitFileError({ operation: "validate", cause: "File exceeds 2 MB" });
    const text = yield* fs.readFileString(selected);
    grantedPaths.add(selected);
    return { name: path.basename(selected), path: selected, text };
  }).pipe(
    Effect.mapError((cause) =>
      isCircuitFileError(cause) ? cause : new CircuitFileError({ operation: "open", cause }),
    ),
  );

  const save = Effect.fn("tsci.circuitFiles.save")(
    function* (input: typeof CircuitSaveInputSchema.Type) {
      if (
        input.text.length > 32 * 1024 * 1024 ||
        !/\.(json|tsx|jsx|zip|csv|svg)$/.test(input.name) ||
        path.basename(input.name) !== input.name
      ) {
        return yield* new CircuitFileError({
          operation: "validate",
          cause: "Unsupported export name or size",
        });
      }
      let selected = input.path;
      if (selected && !grantedPaths.has(selected))
        return yield* new CircuitFileError({
          operation: "validate",
          cause: "Choose a file before saving to it",
        });
      if (!selected) {
        const result = yield* picker.save(input.name);
        if (Option.isNone(result)) return null;
        selected = result.value;
      }
      const destination = selected;
      const bytes = yield* Effect.try({
        try: () =>
          input.encoding === "base64"
            ? Uint8Array.from(atob(input.text), (character) => character.charCodeAt(0))
            : new TextEncoder().encode(input.text),
        catch: (cause) => new CircuitFileError({ operation: "validate", cause }),
      });
      const temporaryDirectory = yield* fs.makeTempDirectory({
        directory: path.dirname(destination),
        prefix: ".tsci-",
      });
      const temporary = path.join(temporaryDirectory, "circuit.tmp");
      yield* fs
        .writeFile(temporary, bytes)
        .pipe(
          Effect.andThen(fs.rename(temporary, destination)),
          Effect.ensuring(
            fs
              .remove(temporaryDirectory, { recursive: true, force: true })
              .pipe(Effect.orElseSucceed(() => undefined)),
          ),
        );
      grantedPaths.add(destination);
      return { name: path.basename(destination), path: destination };
    },
    Effect.mapError((cause) =>
      isCircuitFileError(cause) ? cause : new CircuitFileError({ operation: "save", cause }),
    ),
  );
  return CircuitFiles.of({ open, save });
});

export const layer = Layer.effect(CircuitFiles, make);
