import "./ChapterInstructionsContent.css";

// A structurally clear, empty placeholder for a future instructional
// screenshot — never a fake/placeholder image, just a labeled empty slot a
// real image can be dropped into later.
function ImageSlot({ label }) {
  return (
    <div className="chapter-instructions__image-slot" role="presentation">
      <span>Image placeholder: {label}</span>
    </div>
  );
}

export default function ChapterInstructionsContent() {
  return (
    <div className="chapter-instructions">
      <section>
        <h4>Portal overview</h4>
        <p>
          As a chapter master, you manage your county&rsquo;s posts, records-request goals, archive
          documents, meetings, county statistics, and your own account settings — all scoped to
          your assigned county.
        </p>
      </section>

      <section>
        <h4>Posts</h4>
        <p>
          Create a draft, use Preview to see how it will appear before anyone else does, then
          publish it (or submit it, depending on your account&rsquo;s trust level below).
        </p>
        <p>
          <strong>Trusted</strong> chapter masters publish directly — your post goes live
          immediately. <strong>Restricted</strong> chapter masters submit posts for administrator
          review; an administrator must approve a post before it appears publicly.
        </p>
        <ImageSlot label="Post composer" />
      </section>

      <section>
        <h4>Email campaigns</h4>
        <p>
          Trusted chapter masters may request one county email campaign while publishing a county
          post.
        </p>
        <ul>
          <li>The campaign is sent to an administrator for approval.</li>
          <li>Recipients are your county&rsquo;s newsletter subscribers.</li>
          <li>Only one campaign may be requested per post.</li>
          <li>Once requested, it cannot be undone or requested again.</li>
          <li>Published posts with campaign history are retained permanently for delivery records.</li>
        </ul>
      </section>

      <section>
        <h4>Meetings</h4>
        <p>
          A meeting post requires complete date, time, and location information. Submitting one
          also creates a county meeting entry that appears on the public meeting schedule.
        </p>
        <ImageSlot label="Meeting fields" />
      </section>

      <section>
        <h4>Records Request Goals</h4>
        <p>
          Create and maintain investigative goals: draft the request language, verify your
          request-profile before it is used publicly, preview the generated request, track
          completion state, and associate the records you receive with the goal they answer.
        </p>
      </section>

      <section>
        <h4>Archive Documents</h4>
        <p>
          Records you receive can be reviewed through the archive workspace and associated with
          the investigative goal they belong to.
        </p>
      </section>

      <section>
        <h4>County Statistics</h4>
        <p>
          Newsletter subscriber totals are visible here without revealing any subscriber&rsquo;s
          address. Camera and drone counts you are authorized to maintain for your county can also
          be updated here.
        </p>
      </section>

      <section>
        <h4>Account Settings</h4>
        <p>
          Manage your forwarding email address and your password/account controls here.
        </p>
      </section>

      <p className="chapter-instructions__warning" role="alert">
        Never publish private requester information, passwords, identification scans, or other
        sensitive personal data in a post, image, or document.
      </p>
    </div>
  );
}
