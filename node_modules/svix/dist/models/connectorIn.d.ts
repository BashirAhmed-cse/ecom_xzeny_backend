import { type ConnectorKind } from "./connectorKind";
export interface ConnectorIn {
    description?: string;
    featureFlags?: string[] | null;
    filterTypes?: string[] | null;
    instructions?: string;
    kind?: ConnectorKind;
    logo: string;
    name: string;
    transformation: string;
}
export declare const ConnectorInSerializer: {
    _fromJsonObject(object: any): ConnectorIn;
    _toJsonObject(self: ConnectorIn): any;
};
