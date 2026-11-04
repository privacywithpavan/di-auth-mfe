import { type ChangeEventHandler, useId } from "react";
import { AuthInput as Input } from "@/components/auth/auth-input";
import { AuthLabel as Label } from "@/components/auth/auth-label";
import { AuthNativeSelect as NativeSelect } from "@/components/auth/auth-native-select";

export function PhoneField({
  countryCode,
  onCountryChange,
}: {
  countryCode: string;
  onCountryChange: ChangeEventHandler<HTMLSelectElement>;
}) {
  const phoneId = useId();
  return (
    <div className="grid gap-field-gap">
      <Label htmlFor={phoneId}>Mobile phone number (optional)</Label>
      <div className="flex h-control-compact items-center rounded-sm border border-input bg-white focus-within:border-ring focus-within:shadow-input-focus">
        <NativeSelect
          className="h-[42px] w-24 shrink-0 [&>select]:border-0 [&>select]:bg-transparent [&>select]:pl-3 [&>select]:text-body [&>select]:font-normal [&>select]:focus-visible:ring-0"
          aria-label="Phone country code"
          value={countryCode}
          onChange={onCountryChange}
        >
          <option value="+1">US +1</option>
          <option value="+91">IN +91</option>
          <option value="+44">UK +44</option>
        </NativeSelect>
        <Input
          density="registration"
          className="h-11 min-w-0 border-0 shadow-none focus:shadow-none"
          id={phoneId}
          name="phone"
          type="tel"
          autoComplete="tel-national"
        />
      </div>
    </div>
  );
}
