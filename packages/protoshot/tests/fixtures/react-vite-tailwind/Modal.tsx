import { createPortal } from "react-dom";

export default function Modal() {
  return (
    <>
      <span className="bg-[#00ff00]">trigger</span>
      {createPortal(
        <div className="fixed top-[300px] left-[600px] h-[100px] w-[200px] bg-[#0000ff]" />,
        document.body,
      )}
    </>
  );
}
