import type { CapabilityPanelProps } from "./types";
export function SecretPanel({
  data,
  isGM,
  members,
  onChange,
}: CapabilityPanelProps) {
  return (
    <div>
      <label>
        可见范围
        <select
          disabled={!isGM}
          value={data.scope ?? "all"}
          onChange={(e) => onChange({ ...data, scope: e.target.value })}
        >
          <option value="all">全员可见</option>
          <option value="gm">仅 GM 可见</option>
          <option value="selected">指定成员可见</option>
        </select>
      </label>
      {data.scope === "selected" &&
        members.map((member) => (
          <label key={member.userId} className="member-check">
            <input
              type="checkbox"
              disabled={!isGM}
              checked={data.users?.includes(member.userId) ?? false}
              onChange={(e) =>
                onChange({
                  ...data,
                  users: e.target.checked
                    ? [...(data.users ?? []), member.userId]
                    : data.users.filter((id: string) => id !== member.userId),
                })
              }
            />
            {member.name}
          </label>
        ))}
    </div>
  );
}
