import Map "mo:core/Map";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import List "mo:core/List";
import Runtime "mo:core/Runtime";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";

actor {
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);

  type Client = {
    id : Text;
    name : Text;
    address : Text;
    csz : Text;
    dob : Text;
    ssn : Text;
    phone : Text;
    report : Text;
    letter : Text;
    notes : Text;
    status : Text;
    date : Text;
  };

  module Client {
    public func compare(client1 : Client, client2 : Client) : { #less; #equal; #greater } {
      Text.compare(client1.id, client2.id);
    };
  };

  public type UserProfile = {
    name : Text;
  };

  let clients = Map.empty<Principal, Map.Map<Text, Client>>();
  let models = Map.empty<Principal, Text>();
  let userProfiles = Map.empty<Principal, UserProfile>();

  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can access profiles");
    };
    userProfiles.get(caller);
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?UserProfile {
    if (caller != user and not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Can only view your own profile");
    };
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can save profiles");
    };
    userProfiles.add(caller, profile);
  };

  public shared ({ caller }) func saveClient(client : Client) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can save clients");
    };

    let userClients = switch (clients.get(caller)) {
      case (null) { Map.empty<Text, Client>() };
      case (?map) { map };
    };
    userClients.add(client.id, client);
    clients.add(caller, userClients);
  };

  public shared ({ caller }) func deleteClient(id : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can delete clients");
    };

    switch (clients.get(caller)) {
      case (null) { Runtime.trap("Client does not exist") };
      case (?userClients) {
        if (not userClients.containsKey(id)) { Runtime.trap("Client does not exist") };
        userClients.remove(id);
        clients.add(caller, userClients);
      };
    };
  };

  public query ({ caller }) func getClients() : async [Client] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can access clients");
    };

    switch (clients.get(caller)) {
      case (null) { [] };
      case (?userClients) { userClients.values().toArray().sort() };
    };
  };

  public query ({ caller }) func getModel() : async Text {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can access model preferences");
    };

    switch (models.get(caller)) {
      case (null) { "llama-3.3-70b" };
      case (?model) { model };
    };
  };

  public shared ({ caller }) func saveModel(model : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can save model preferences");
    };

    models.add(caller, model);
  };
};
