import { useHead } from "@/lib/seo";
import { Link } from "react-router-dom";
import { Brand } from "@/components/Brand";

export default function About() {
  useHead({ title: "About Dawghwa", path: "/about", description: "Dawghwa is a manga, manhwa and manhua discovery and reading app that learns your taste on your device." });
  return (
    <div className="page page-narrow prose">
      <Brand />
      <h1 style={{ marginTop: 16 }}>About Dawghwa</h1>
      <p>Dawghwa helps you find and read manga, manhwa, manhua and webtoons. Recommendations are learned on your device from what you read, save and hide. No account is needed and no reading data leaves your device.</p>
      <p>
        <Link to="/start">Install Dawghwa or share its front page</Link>
      </p>
      <h2>Where content comes from</h2>
      <p>
        Dawghwa doesn't host any comics. Catalogue data, covers and chapters come from the sources connected to the Dawghwa API. Reading inside the app is offered only for sources that provide chapter pages through the API, currently{" "}
        <a href="https://mangadex.org" target="_blank" rel="noopener noreferrer">
          MangaDex
        </a>
        . Chapters from other sources open on their own sites. Scanlation groups are credited on every chapter.
      </p>
      <h2>Offline</h2>
      <p>The app shell, your library, history and recently viewed catalogue pages work offline. Chapter pages are not stored for offline reading.</p>
      <h2>Credits</h2>
      <ul>
        <li>
          Source adapters are based on{" "}
          <a href="https://github.com/GooglyBlox/comick-source-api" target="_blank" rel="noopener noreferrer">
            comick-source-api
          </a>{" "}
          by GooglyBlox, MIT License.
        </li>
        <li>
          Catalogue metadata and chapter images from the{" "}
          <a href="https://api.mangadex.org/docs/" target="_blank" rel="noopener noreferrer">
            MangaDex API
          </a>
          . Dawghwa is not affiliated with MangaDex.
        </li>
        <li>Typefaces: Archivo and Inter (SIL Open Font License). Icons: Lucide (ISC).</li>
      </ul>
    </div>
  );
}
