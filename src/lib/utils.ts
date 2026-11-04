import { createCn } from "cn/config";

export const cn = createCn({
  extend: {
    theme: {
      spacing: [
        "step",
        "step-compact",
        "control",
        "control-compact",
        "action",
        "action-compact",
        "field-gap",
        "identifier-gap",
        "status",
        "verification",
        "verification-spinner",
      ],
      radius: ["notice"],
      text: [
        "field",
        "body",
        "help",
        "caption",
        "step-title",
        "message",
        "method-title",
        "badge",
      ],
      "font-weight": ["emphasis"],
      shadow: ["input-focus", "success"],
    },
  },
});
