import { POST_BODY_MAX, POST_TITLE_MAX } from "@starter/contracts";
import { useState } from "react";

import { Button } from "../components/button";
import { ErrorBanner } from "../components/feedback";
import { FormScreen } from "../components/form-screen";
import { TextField } from "../components/text-field";
import { validatePost, type FieldErrors } from "../lib/validation";

type PostValues = { title: string; body: string };

interface PostFormProps {
  initial?: PostValues;
  submitLabel: string;
  onSubmit: (values: PostValues) => void;
  pending: boolean;
  error: unknown;
}

/** "글쓰기"와 "글 수정"이 함께 쓴다. `initial`은 마운트할 때 한 번만 읽는다. */
export function PostForm({ initial, submitLabel, onSubmit, pending, error }: PostFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof PostValues>>({});

  function submit() {
    const values = { title, body };
    const errors = validatePost(values);
    setFieldErrors(errors ?? {});
    if (!errors) onSubmit(values);
  }

  return (
    <FormScreen>
      {error ? <ErrorBanner error={error} /> : null}
      <TextField
        label="제목"
        value={title}
        onChangeText={setTitle}
        maxLength={POST_TITLE_MAX}
        error={fieldErrors.title}
        autoFocus={!initial}
      />
      <TextField
        label="내용"
        value={body}
        onChangeText={setBody}
        maxLength={POST_BODY_MAX}
        multiline
        error={fieldErrors.body}
      />
      <Button title={submitLabel} onPress={submit} loading={pending} />
    </FormScreen>
  );
}
