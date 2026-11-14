import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export class CircuitFilePickerError extends Schema.TaggedError<CircuitFilePickerError>()(
  "CircuitFilePickerError",
  { cause: Schema.Defect() },
) {}

export class CircuitFilePicker extends Context.Service<
  CircuitFilePicker,
  {
    readonly open: Effect.Effect<Option.Option<string>, CircuitFilePickerError>;
    readonly save: (name: string) => Effect.Effect<Option.Option<string>, CircuitFilePickerError>;
  }
>()("@t3tools/desktop/circuits/CircuitFilePicker") {}
