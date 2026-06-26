import {
  GuideLayout,
  GuideH2,
  GuideP,
  GuideTerm,
  GuideList,
  GuideSteps,
  GuideCallout,
} from "@/components/GuideLayout";
import { guideMetadata } from "@/lib/seo";
import { articleSchema } from "@/lib/jsonld";

export const metadata = guideMetadata({
  slug: "roundordermanager",
  title: "Setting your round order",
  description:
    "Set the order you visit clients in so every runsheet comes out in driving order. Drag and drop, move to position, search and save with Guvnor's Round Order Manager.",
});

export default function RoundOrderManagerGuidePage() {
  return (
    <GuideLayout
      jsonLd={articleSchema({ slug: "roundordermanager", title: "Setting your round order" })}
      title="Setting your round order"
      intro="Round order is the sequence you visit your clients in. Get it right once and every runsheet for the rest of the year comes out in driving order — no rearranging each morning. The Round Order Manager is where you set and tidy that sequence."
    >
      <GuideH2>Why round order matters</GuideH2>
      <GuideP>
        Your runsheet lists each day&apos;s jobs in round order, top to bottom.
        If that order mirrors how you actually drive — street by street, nearest
        to furthest — your day flows with almost no thinking. A messy round
        order means zig-zagging across town, so it&apos;s worth a few minutes to
        get it sensible.
      </GuideP>

      <GuideH2>Opening the manager</GuideH2>
      <GuideP>
        From the home screen, tap <GuideTerm>Round Order Manager</GuideTerm>. You
        get one clean list of every active client, numbered <code>1</code>{" "}
        upwards in their current order.
      </GuideP>

      <GuideH2>Reordering clients</GuideH2>
      <GuideP>There are two ways to move a client:</GuideP>
      <GuideList
        items={[
          <>
            <GuideTerm>Drag and drop.</GuideTerm> On a phone, press and hold the
            grip handle on the right of a row, then drag it up or down. On the
            web, click and hold the same handle and drag. The list auto-scrolls
            when you reach the top or bottom edge.
          </>,
          <>
            <GuideTerm>Move to a position.</GuideTerm> Tap a client to expand it,
            type a position number and hit <GuideTerm>Go</GuideTerm> — or use the{" "}
            <GuideTerm>Top</GuideTerm> / <GuideTerm>Bottom</GuideTerm> shortcuts
            to send it to the start or end of the round.
          </>,
        ]}
      />
      <GuideP>
        Clients you&apos;ve moved are flagged with a small dot so you can see
        what&apos;s changed before you save. The header keeps a running count of
        how many you&apos;ve moved.
      </GuideP>

      <GuideH2>Finding a client fast</GuideH2>
      <GuideP>
        Big round? Use the search box to filter by address, name or account
        number. While a search is active you can tap a client and send it to a
        position; clear the search to go back to drag-and-drop on the full list.
      </GuideP>

      <GuideH2>Saving changes</GuideH2>
      <GuideSteps
        items={[
          "Get the list into the order you want.",
          <>
            Tap <GuideTerm>Save</GuideTerm>. Guvnor confirms how many clients it
            will renumber.
          </>,
          "Saving renumbers everyone into a clean 1-to-N sequence so there are no gaps.",
        ]}
      />
      <GuideP>
        Changed your mind? <GuideTerm>Reset</GuideTerm> reverts the list to the
        last saved order, and <GuideTerm>Discard / Back</GuideTerm> leaves
        without saving (it&apos;ll check first if you have unsaved moves).
      </GuideP>

      <GuideCallout>
        <GuideTerm>Seeing a &ldquo;gaps or duplicates&rdquo; notice?</GuideTerm>{" "}
        That just means the stored numbering has drifted (common after imports or
        deletions). Tap <GuideTerm>Save</GuideTerm> once — even without moving
        anyone — and Guvnor renumbers everything cleanly.
      </GuideCallout>

      <GuideH2>Adding new clients to the round</GuideH2>
      <GuideP>
        When you add a new client, Guvnor lets you choose where they slot into
        the round at that point, so you usually won&apos;t need to come back
        here. The Round Order Manager is for the bigger tidy-ups — for example
        after winning a cluster of new work on one street.
      </GuideP>
    </GuideLayout>
  );
}
