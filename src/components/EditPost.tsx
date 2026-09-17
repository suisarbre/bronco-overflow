"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { updateAnswer, updateQuestion, type FormState } from "@/app/actions";
import { ImagePicker } from "./ImagePicker";
import { TagSelect } from "./TagSelect";

const EditingContext = createContext<{ setEditing: (editing: boolean) => void } | null>(null);

/** Shows `children` normally and `form` while editing; EditButton inside `children` flips it. */
export function Editable({ children, form }: { children: ReactNode; form: ReactNode }) {
  const [editing, setEditing] = useState(false);
  return (
    <EditingContext.Provider value={{ setEditing }}>{editing ? form : children}</EditingContext.Provider>
  );
}

export function EditButton() {
  const ctx = useContext(EditingContext);
  return (
    <button
      type="button"
      onClick={() => ctx?.setEditing(true)}
      className="text-sm text-muted underline-offset-2 hover:text-fg hover:underline"
    >
      Edit
    </button>
  );
}

const field =
  "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";

export function EditForm(
  props:
    | { type: "q"; id: number; title: string; body: string; tag: string; imageUrl: string | null }
    | { type: "a"; id: number; body: string; imageUrl: string | null },
) {
  const ctx = useContext(EditingContext);
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    props.type === "q" ? updateQuestion : updateAnswer,
    {},
  );

  useEffect(() => {
    if (state.ok) ctx?.setEditing(false);
  }, [state, ctx]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("id", String(props.id));
    if (image) {
      form.set("imageAction", "replace");
      form.set("image", image);
    } else {
      form.set("imageAction", removeImage ? "remove" : "keep");
    }
    startTransition(() => formAction(form));
  }

  const showCurrent = props.imageUrl && !removeImage && !image;

  return (
    <form onSubmit={submit} className="space-y-3">
      {props.type === "q" && (
        <>
          <input
            name="title"
            required
            minLength={5}
            maxLength={150}
            defaultValue={props.title}
            aria-label="Title"
            className={`${field} text-lg font-semibold`}
          />
          <TagSelect defaultValue={props.tag} />
        </>
      )}
      <textarea
        name="body"
        rows={6}
        maxLength={5000}
        defaultValue={props.body}
        aria-label={props.type === "q" ? "Details" : "Answer"}
        className={`${field} resize-y`}
      />

      {showCurrent ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- existing upload */}
          <img src={props.imageUrl!} alt="Current attachment" className="h-16 w-16 rounded-lg border border-line object-cover" />
          <button
            type="button"
            onClick={() => setRemoveImage(true)}
            className="text-sm text-muted underline-offset-2 hover:text-danger hover:underline"
          >
            Remove photo
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <ImagePicker file={image} onChange={setImage} disabled={pending} />
          {props.imageUrl && removeImage && !image && (
            <button
              type="button"
              onClick={() => setRemoveImage(false)}
              className="text-sm text-muted underline-offset-2 hover:underline"
            >
              Keep original photo
            </button>
          )}
        </div>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => ctx?.setEditing(false)}
          disabled={pending}
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-subtle"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
