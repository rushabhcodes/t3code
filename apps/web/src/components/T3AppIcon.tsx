// The production icon, as GitHub shows the TSCI Code app, whatever this build's channel.
import appIconUrl from "../../../../assets/tsci/logo.svg";

export function T3AppIcon(props: { readonly className?: string }) {
  return <img src={appIconUrl} alt="" className={props.className} />;
}
