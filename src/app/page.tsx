import styles from "./page.module.css";
import WordCycler from "@/components/WordCycler";
import JpegFilter from "@/components/JpegFilter";

export default function Home() {
  return (
    <div className={styles.page}>
      <WordCycler />
      <JpegFilter />
    </div>
  );
}
