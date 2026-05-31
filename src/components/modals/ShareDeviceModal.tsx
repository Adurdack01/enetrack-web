import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  open: boolean;
  onClose: () => void;
  onAddUser: (user: string) => void;
};

export default function ShareDeviceModal({
  open,
  onClose,
  onAddUser,
}: Props) {
  const [value, setValue] = useState("");

  if (!open) return null;

  const handleAdd = () => {
    const v = value.trim();
    if (!v) return;
    onAddUser(v);
    setValue("");
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40">
      <div className="mt-auto w-full max-w-md rounded-t-[32px] bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Share Device
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Add a user to share access.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter name or email"
          />

          <Button onClick={handleAdd} className="w-full rounded-2xl">
            Add User
          </Button>
        </div>
      </div>
    </div>
  );
}