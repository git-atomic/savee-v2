"use client";

import { memo } from "react";
import Link from "next/link";
import type { User } from "@/lib/api";
import { getUserAvatarUrl } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface UserCardProps {
  user: User;
}

function UserCardComponent({ user }: UserCardProps) {
  const avatarUrl = getUserAvatarUrl(user);
  const displayName = user.display_name || user.username;
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Link
      href={`/users/${user.username}`}
      className="group block"
    >
      <div className="rounded-lg border border-border bg-card transition-all hover:border-foreground/20 hover:shadow-md overflow-hidden">
        <div className="p-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16 shrink-0">
              <AvatarImage src={avatarUrl} alt={displayName} />
              <AvatarFallback className="bg-muted text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-foreground group-hover:text-primary">
                    {displayName}
                  </h3>
                  <p className="truncate text-sm text-muted-foreground">
                    @{user.username}
                  </p>
                </div>
                {user.is_verified && (
                  <Badge variant="secondary" className="shrink-0">
                    Verified
                  </Badge>
                )}
              </div>

              {user.bio && (
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {user.bio}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                {user.location && (
                  <span className="flex items-center gap-1">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {user.location}
                  </span>
                )}
                {user.block_count > 0 && (
                  <span className="font-medium text-foreground">
                    {user.block_count.toLocaleString()} block
                    {user.block_count !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {(user.follower_count !== null ||
          user.following_count !== null ||
          user.saves_count !== null) && (
          <div className="border-t border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center justify-evenly gap-4 text-xs text-muted-foreground">
              {user.follower_count !== null && (
                <span>
                  <span className="font-medium text-foreground">
                    {user.follower_count?.toLocaleString()}
                  </span>{" "}
                  followers
                </span>
              )}
              {user.following_count !== null && (
                <span>
                  <span className="font-medium text-foreground">
                    {user.following_count?.toLocaleString()}
                  </span>{" "}
                  following
                </span>
              )}
              {user.saves_count !== null && (
                <span>
                  <span className="font-medium text-foreground">
                    {user.saves_count?.toLocaleString()}
                  </span>{" "}
                  saves
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

export const UserCard = memo(UserCardComponent);
