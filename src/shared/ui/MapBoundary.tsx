import { Component, type ReactNode } from 'react';

/** A blocked third-party map must not remove the shop list and search UI. */
export class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div role="status" style={{ padding: '160px 20px 0', textAlign: 'center', color: '#868e96', fontSize: 14 }}>지도를 불러오지 못했어요. 목록에서 샵을 찾아보세요.</div> : this.props.children;
  }
}
