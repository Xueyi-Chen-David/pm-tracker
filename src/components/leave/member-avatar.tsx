import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { displayInitial, type NameSource } from "@/lib/display";
import { avatarColor } from "@/lib/avatar-color";
import { cn } from "@/lib/utils";

type Identity = NameSource & { id: string; image?: string | null };

/** 彩色圓底頭像（無照片時以姓名首字 + 依 id 決定性選色的底色呈現）。 */
export function MemberAvatar({
  u,
  className,
}: {
  u: Identity | null | undefined;
  className?: string;
}) {
  return (
    <Avatar className={cn("h-8 w-8", className)}>
      {u?.image && <AvatarImage src={u.image} alt="" />}
      <AvatarFallback
        style={u ? { backgroundColor: avatarColor(u.id), color: "#fff" } : undefined}
        className="font-medium"
      >
        {displayInitial(u)}
      </AvatarFallback>
    </Avatar>
  );
}
