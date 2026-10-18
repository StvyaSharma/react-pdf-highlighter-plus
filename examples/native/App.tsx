import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import sampleAsset from "../../tests/fixtures/reader.epub";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import {
  EpubReader,
  type EpubReaderHandle,
  type NativeEpubSource,
  type ReaderState,
  type DocumentHighlight,
} from "react-pdf-highlighter-plus/native";

function ReaderDemo() {
  const ref = useRef<EpubReaderHandle>(null);
  const [sample, setSample] = useState<NativeEpubSource | null>(null);
  const [source, setSource] = useState<NativeEpubSource | null>(null);
  const [state, setState] = useState<ReaderState>({
    status: "idle",
    error: null,
    location: null,
  });
  const [highlights, setHighlights] = useState<DocumentHighlight[]>([]);
  const [dark, setDark] = useState(false);
  const [scroll, setScroll] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [message, setMessage] = useState("Loading sample…");
  const [customErrors, setCustomErrors] = useState(false);
  const [tool, setTool] = useState("highlight");
  const styles = useMemo(
    () => ({
      fontSize,
      fontFamily: "Georgia, serif",
      lineHeight: 1.6,
      color: dark ? "#eeeeee" : "#222222",
      background: dark ? "#202020" : "#ffffff",
    }),
    [fontSize, dark],
  );
  useEffect(() => {
    let active = true;
    void (async () => {
      const asset = Asset.fromModule(sampleAsset);
      await asset.downloadAsync();
      const local = {
        base64: await new File(asset.localUri ?? asset.uri).base64(),
      };
      if (active) {
        setSample(local);
        setSource(local);
        setMessage("Sample loaded");
      }
    })().catch((error) => setMessage(String(error)));
    return () => {
      active = false;
    };
  }, []);
  const run = (operation: () => Promise<unknown>) => {
    void operation().catch((error) => setMessage(String(error)));
  };
  const check = async () => {
    const reader = ref.current!;
    let passed = 0;
    const ensure = (condition: unknown) => {
      if (!condition) throw new Error(`Native check ${passed + 1} failed`);
      passed++;
    };
    ensure((await reader.getOutline()).length === 3);
    const matches = await reader.search("lighthouse");
    ensure(matches.length === 6);
    await reader.display(2);
    ensure((await reader.getLocation())?.cfi?.includes("/6/6"));
    await reader.display(0);
    await reader.next();
    await reader.prev();
    ensure((await reader.getLocation())?.cfi?.includes("/6/2"));
    const cfi = matches[0].cfi!;
    ensure((await reader.annotate("underline", cfi)) === cfi);
    await reader.removeAnnotation(cfi, "underline");
    passed++;
    await reader.clearSelection();
    passed++;
    await reader.configure({ styles, features: { search: false } });
    ensure((await reader.search("lighthouse")).length === 0);
    await reader.configure({ styles, highlights });
    setMessage(`Native checks: ${passed}/8 passed`);
  };

  return (
    <SafeAreaView style={ui.screen} edges={["top", "bottom"]}>
      <Text style={ui.title}>EPUB reader</Text>
      <Text accessibilityLiveRegion="polite" style={ui.status}>
        {state.status} · {message} · {highlights.length} annotations
      </Text>
      <ScrollView
        horizontal
        style={ui.toolbar}
        contentContainerStyle={ui.tools}
      >
        <Action
          label={"Previous"}
          onPress={() => run(async () => ref.current?.prev())}
        />
        <Action
          label={"Next"}
          onPress={() => run(async () => ref.current?.next())}
        />
        <Action
          label={"Contents"}
          onPress={() =>
            run(async () => {
              const toc = await ref.current!.getOutline();
              setMessage(toc.map((item) => item.label).join(", "));
            })
          }
        />
        <Action
          label={"Search"}
          onPress={() =>
            run(async () => {
              const found = await ref.current!.search("lighthouse");
              setMessage(`${found.length} matches for lighthouse`);
              if (found[0]) await ref.current!.display(found[0].cfi);
            })
          }
        />
        <Action label={"Run checks"} onPress={() => run(check)} />
      </ScrollView>
      <ScrollView
        horizontal
        style={ui.toolbar}
        contentContainerStyle={ui.tools}
      >
        <Action
          label="Annotate selection"
          onPress={() =>
            run(async () => {
              if (!(await ref.current!.captureSelection()))
                setMessage("Select text first");
            })
          }
        />
        <Action
          label={dark ? "Light" : "Dark"}
          onPress={() => setDark(!dark)}
        />
        <Action
          label={"Larger text"}
          onPress={() => setFontSize((size) => (size >= 28 ? 18 : size + 2))}
        />
        <Action
          label={scroll ? "Pages" : "Scroll"}
          onPress={() => setScroll(!scroll)}
        />
        <Action
          label={"Tool: " + tool}
          onPress={() =>
            setTool((value) =>
              value === "highlight"
                ? "underline"
                : value === "underline"
                  ? "mark"
                  : "highlight",
            )
          }
        />
        <Action label={"Clear annotations"} onPress={() => setHighlights([])} />
      </ScrollView>
      <View
        style={[
          ui.tools,
          { flexDirection: "row", flexWrap: "wrap", paddingTop: 8 },
        ]}
      >
        <Action
          label={"Test load error"}
          onPress={() => setSource({ base64: "invalid" })}
        />
        <Action
          label={"Restore sample"}
          onPress={() => {
            setHighlights([]);
            setSource(sample);
          }}
        />
        <Action
          label={customErrors ? "Default errors" : "Custom errors"}
          onPress={() => setCustomErrors(!customErrors)}
        />
      </View>
      <View style={ui.reader}>
        {source ? (
          <EpubReader
            ref={ref}
            source={source}
            highlights={highlights}
            styles={styles}
            flow={scroll ? "scrolled-doc" : "paginated"}
            onStateChange={setState}
            onError={(error) => setMessage(error.code)}
            onSelection={(selection) => {
              setHighlights((items) => [
                ...items,
                {
                  id: String(Date.now()),
                  type: tool,
                  position: selection.position,
                  content: selection.content,
                },
              ]);
              run(async () => ref.current?.clearSelection());
            }}
            renderStatus={
              customErrors
                ? (value, retry) =>
                    value.error ? (
                      <View style={ui.error}>
                        <Text accessibilityRole="alert">
                          Reader error: {value.error.code}
                        </Text>
                        {<Action label={"Retry document"} onPress={retry} />}
                      </View>
                    ) : null
                : undefined
            }
          />
        ) : (
          <Text>Preparing book…</Text>
        )}
      </View>
    </SafeAreaView>
  );
}
function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={ui.button}>
      <Text>{label}</Text>
    </Pressable>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <ReaderDemo />
    </SafeAreaProvider>
  );
}
const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  title: { fontSize: 22, fontWeight: "600", paddingHorizontal: 12 },
  status: { padding: 12, fontSize: 12 },
  toolbar: { flexGrow: 0, maxHeight: 46 },
  tools: { paddingHorizontal: 8, gap: 8 },
  button: {
    padding: 10,
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 6,
    backgroundColor: "white",
    alignSelf: "flex-start",
  },
  reader: { flex: 1, marginTop: 8 },
  error: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
});
