import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { displayName, displayInitial } from "@/lib/display";

type M = {
  user: {
    id: string;
    name: string | null;
    nickname?: string | null;
    useNickname?: boolean | null;
    email: string | null;
    image: string | null;
  };
};

export function MemberAvatars({
  members,
  max = 4,
  size = "sm",
}: {
  members: M[];
  max?: number;
  size?: "sm" | "md";
}) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((m) => {
        const initials = displayInitial(m.user);
        return (
          <Avatar
            key={m.user.id}
            className={cn("ring-background ring-2", dim)}
            title={displayName(m.user)}
          >
            {m.user.image && <AvatarImage src={m.user.image} alt="" />}
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
        );
      })}
      {extra > 0 && (
        <div
          title={members
            .slice(max)
            .map((m) => displayName(m.user))
            .join("、")}
          className={cn(
            "bg-muted text-muted-foreground ring-background flex items-center justify-center rounded-full ring-2",
            dim,
          )}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}
