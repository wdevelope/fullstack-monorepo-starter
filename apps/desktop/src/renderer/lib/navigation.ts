/** In-app screens. The app has a single window and no URLs, so plain state is enough. */
export type View =
  | { name: "posts" }
  | { name: "post"; id: string }
  | { name: "new-post" }
  | { name: "edit-post"; id: string }
  | { name: "sign-in" }
  | { name: "sign-up" };

export type Navigate = (view: View) => void;
