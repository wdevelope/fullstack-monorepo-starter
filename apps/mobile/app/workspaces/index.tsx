import { WORKSPACE_NAME_MAX } from "@starter/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Redirect, router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { Button } from "../../src/components/button";
import { ErrorBanner, ErrorView, LoadingView } from "../../src/components/feedback";
import { TextField } from "../../src/components/text-field";
import { orpc, queryClient } from "../../src/lib/api";
import { useUser } from "../../src/session/use-user";

export default function WorkspaceListScreen() {
  const user = useUser();
  const [name, setName] = useState("");
  const workspaces = useQuery(orpc.workspaces.list.queryOptions());
  const create = useMutation(
    orpc.workspaces.create.mutationOptions({
      onSuccess: (workspace) => {
        setName("");
        void queryClient.invalidateQueries({ queryKey: orpc.workspaces.key() });
        router.push(`/workspaces/${workspace.id}`);
      },
    }),
  );

  if (!user) return <Redirect href="/sign-in" />;
  if (workspaces.isPending) return <LoadingView />;
  if (workspaces.isError) {
    return <ErrorView error={workspaces.error} onRetry={() => void workspaces.refetch()} />;
  }

  return (
    <FlatList
      className="bg-white"
      data={workspaces.data.items}
      keyExtractor={(workspace) => workspace.id}
      ListHeaderComponent={
        <View className="gap-3 border-b border-neutral-100 px-5 py-4">
          <TextField
            label="New workspace"
            value={name}
            maxLength={WORKSPACE_NAME_MAX}
            onChangeText={setName}
          />
          {create.error ? <ErrorBanner error={create.error} /> : null}
          <Button
            title="Create"
            compact
            loading={create.isPending}
            disabled={!name.trim()}
            onPress={() => create.mutate({ name })}
          />
        </View>
      }
      ListEmptyComponent={
        <Text className="px-8 pt-12 text-center text-base text-neutral-500">
          You are not in any workspace yet.
        </Text>
      }
      renderItem={({ item }) => (
        <Link href={`/workspaces/${item.id}`} asChild>
          <Pressable className="flex-row items-center justify-between px-5 py-4 active:bg-neutral-50">
            <Text className="text-[17px] font-semibold text-neutral-900">{item.name}</Text>
            <Text className="text-xs capitalize text-neutral-500">{item.role}</Text>
          </Pressable>
        </Link>
      )}
    />
  );
}
