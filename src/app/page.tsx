import styles from "./page.module.css";
import WordCycler from "@/components/WordCycler";

export default function Home() {
  return (
    <div className={styles.page}>
      <WordCycler />
    </div>
  );
}
