"use client";

import { useEffect, useCallback, useState } from "react";
import sdk, {
  AddFrame,
  SignIn as SignInCore,
  type Context,
} from "@farcaster/frame-sdk";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/card";

import { config } from "~/components/providers/WagmiProvider";
import { truncateAddress } from "~/lib/truncateAddress";
import { base, optimism } from "wagmi/chains";
import { useSession } from "next-auth/react";
import { createStore } from "mipd";
import { Label } from "~/components/ui/label";
import { PROJECT_TITLE } from "~/lib/constants";

function UnfollowersList({ unfollowers }: { unfollowers: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Unfollowers</CardTitle>
        <CardDescription>Last {UNFOLLOWERS_LIMIT} users who unfollowed you</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {unfollowers.map((user) => (
          <div key={user.fid} className="flex items-center justify-between text-sm">
            <span>@{user.username}</span>
            <span className="text-muted-foreground">
              {new Date(user.unfollowed_at).toLocaleDateString()}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function Frame() {
  const { data: session } = useSession();
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [context, setContext] = useState<Context.FrameContext>();
  const [unfollowers, setUnfollowers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [added, setAdded] = useState(false);

  const [addFrameResult, setAddFrameResult] = useState("");

  const addFrame = useCallback(async () => {
    try {
      await sdk.actions.addFrame();
    } catch (error) {
      if (error instanceof AddFrame.RejectedByUser) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      if (error instanceof AddFrame.InvalidDomainManifest) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      setAddFrameResult(`Error: ${error}`);
    }
  }, []);

  const fetchUnfollowers = useCallback(async (fid: number) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Get followers and following lists
      const [followersRes, followingRes] = await Promise.all([
        fetch(`${NEYNAR_API_URL}/user/followers?fid=${fid}&limit=200`, {
          headers: { 'api_key': process.env.NEXT_PUBLIC_NEYNAR_API_KEY! }
        }),
        fetch(`${NEYNAR_API_URL}/user/following?fid=${fid}&limit=200`, {
          headers: { 'api_key': process.env.NEXT_PUBLIC_NEYNAR_API_KEY! }
        })
      ]);

      const [followersData, followingData] = await Promise.all([
        followersRes.json(),
        followingRes.json()
      ]);

      // Find users who were previously followed but no longer in followers
      const previousFollowers = new Set(followingData.result.users.map((u: any) => u.fid));
      const currentFollowers = new Set(followersData.result.users.map((u: any) => u.fid));
      
      const unfollowers = followersData.result.users
        .filter((user: any) => !currentFollowers.has(user.fid) && previousFollowers.has(user.fid))
        .sort((a: any, b: any) => 
          new Date(b.unfollowed_at).getTime() - new Date(a.unfollowed_at).getTime())
        .slice(0, UNFOLLOWERS_LIMIT);

      setUnfollowers(unfollowers);
    } catch (err) {
      setError('Failed to fetch unfollowers');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      if (session?.user?.fid) {
        await fetchUnfollowers(session.user.fid);
      }
      const context = await sdk.context;
      if (!context) {
        return;
      }

      setContext(context);
      setAdded(context.client.added);

      // If frame isn't already added, prompt user to add it
      if (!context.client.added) {
        addFrame();
      }

      sdk.on("frameAdded", ({ notificationDetails }) => {
        setAdded(true);
      });

      sdk.on("frameAddRejected", ({ reason }) => {
        console.log("frameAddRejected", reason);
      });

      sdk.on("frameRemoved", () => {
        console.log("frameRemoved");
        setAdded(false);
      });

      sdk.on("notificationsEnabled", ({ notificationDetails }) => {
        console.log("notificationsEnabled", notificationDetails);
      });
      sdk.on("notificationsDisabled", () => {
        console.log("notificationsDisabled");
      });

      sdk.on("primaryButtonClicked", () => {
        console.log("primaryButtonClicked");
      });

      console.log("Calling ready");
      sdk.actions.ready({});

      // Set up a MIPD Store, and request Providers.
      const store = createStore();

      // Subscribe to the MIPD Store.
      store.subscribe((providerDetails) => {
        console.log("PROVIDER DETAILS", providerDetails);
        // => [EIP6963ProviderDetail, EIP6963ProviderDetail, ...]
      });
    };
    if (sdk && !isSDKLoaded) {
      console.log("Calling load");
      setIsSDKLoaded(true);
      load();
      return () => {
        sdk.removeAllListeners();
      };
    }
  }, [isSDKLoaded, addFrame]);

  if (!isSDKLoaded) {
    return <div>Loading...</div>;
  }

  return (
    <div
      style={{
        paddingTop: context?.client.safeAreaInsets?.top ?? 0,
        paddingBottom: context?.client.safeAreaInsets?.bottom ?? 0,
        paddingLeft: context?.client.safeAreaInsets?.left ?? 0,
        paddingRight: context?.client.safeAreaInsets?.right ?? 0,
      }}
    >
      <div className="w-[300px] mx-auto py-2 px-2">
        <h1 className="text-2xl font-bold text-center mb-4 text-gray-700 dark:text-gray-300">
          {PROJECT_TITLE}
        </h1>
        {error ? (
          <Card>
            <CardHeader>
              <CardTitle>Error</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : isLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>Loading...</CardTitle>
              <CardDescription>Fetching unfollower data</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <UnfollowersList unfollowers={unfollowers} />
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Updated: {new Date().toLocaleTimeString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
